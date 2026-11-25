// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OddroOrderDesk} from "../src/OddroOrderDesk.sol";
import {OddroTicketMath as M} from "../src/OddroTicketMath.sol";

interface IForkERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function allowance(address, address) external view returns (uint256);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
    function name() external view returns (string memory);
    function totalSupply() external view returns (uint256);
}

interface IForkWETH is IForkERC20 {
    function deposit() external payable;
}

interface IForkV3Factory {
    function getPool(address, address, uint24) external view returns (address);
}

interface IForkRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
    function factory() external view returns (address);
}

/// @notice Runs against a fork of Robinhood Chain mainnet (chain id 4663):
///   forge test --match-contract Fork --fork-url <rpc> --evm-version cancun
/// Real USDG, the real NVDA stock token (beacon proxy, proven on 23 Nov 2026), the real Uniswap v3 SwapRouter02 and the
/// NVDA/USDG 0.05 % pool (addresses read on chain 25 Nov 2026).
contract OddroForkTest is Test {
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;
    address constant ROUTER = 0xCaf681a66D020601342297493863E78C959E5cb2;
    address constant V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address constant BEACON = 0xe10b6f6B275de231345c20D14Ab812db62151b00;
    bytes32 constant BEACON_SLOT = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;
    uint24 constant FEE = 500;

    OddroOrderDesk desk;
    address owner = makeAddr("oddro-fork-owner");
    address agent = makeAddr("oddro-fork-agent");
    bytes32 constant RULES = keccak256("fork: weekly NVDA buy");

    function setUp() public {
        if (block.chainid != 4663) vm.skip(true);
        desk = new OddroOrderDesk(ROUTER);
        // Owner gets USDG by buying it with WETH on the real WETH/USDG pool (no storage tricks).
        vm.deal(owner, 10 ether);
        vm.startPrank(owner);
        IForkWETH(WETH).deposit{value: 2 ether}();
        IForkERC20(WETH).approve(ROUTER, type(uint256).max);
        uint24[4] memory fees = [uint24(100), 500, 3000, 10000];
        uint256 best;
        uint24 bestFee;
        for (uint256 i; i < 4; ++i) {
            address pool = IForkV3Factory(V3_FACTORY).getPool(WETH, USDG, fees[i]);
            if (pool == address(0)) continue;
            uint256 depth = IForkERC20(USDG).balanceOf(pool);
            if (depth > best) {
                best = depth;
                bestFee = fees[i];
            }
        }
        require(bestFee != 0, "no WETH/USDG pool");
        IForkRouter(ROUTER).exactInputSingle(
            IForkRouter.ExactInputSingleParams(WETH, USDG, bestFee, owner, 1 ether, 1, 0)
        );
        IForkERC20(USDG).approve(address(desk), type(uint256).max);
        vm.stopPrank();
        require(IForkERC20(USDG).balanceOf(owner) > 200e6, "owner has too little USDG");
    }

    function _open() internal returns (uint256 id) {
        OddroOrderDesk.DeskInit memory i;
        i.agent = agent;
        i.asset = NVDA;
        i.quote = USDG;
        i.fee = FEE;
        i.maxPerTicket = 50e6;
        i.periodCap = 120e6;
        i.periodLength = 7 days;
        i.minGap = 1 days;
        i.maxTicketLife = 2 days;
        i.expiry = uint64(block.timestamp + 30 days);
        i.ruleHash = RULES;
        vm.prank(owner);
        id = desk.openDesk(i);
    }

    function _input(address asset, uint128 amount, uint128 minOut) internal view returns (OddroOrderDesk.TicketInput memory t) {
        t = OddroOrderDesk.TicketInput(asset, amount, minOut, uint64(block.timestamp + 1 days), RULES, bytes32("fork"));
    }

    function test_fork_addressesAreWhatWeThink() public view {
        assertEq(IForkERC20(USDG).decimals(), 6);
        assertEq(keccak256(bytes(IForkERC20(USDG).symbol())), keccak256("USDG"));
        assertEq(keccak256(bytes(IForkERC20(NVDA).symbol())), keccak256("NVDA"));
        assertEq(address(uint160(uint256(vm.load(NVDA, BEACON_SLOT)))), BEACON);
        assertGt(IForkERC20(NVDA).totalSupply(), 0);
        assertEq(IForkRouter(ROUTER).factory(), V3_FACTORY);
        assertTrue(IForkV3Factory(V3_FACTORY).getPool(NVDA, USDG, FEE) != address(0));
    }

    function test_fork_fullTicket_proposeApproveExecute() public {
        uint256 id = _open();
        OddroOrderDesk.TicketInput memory t = _input(NVDA, 25e6, 1);
        assertEq(desk.checkTicket(id, agent, t), 0);
        vm.prank(agent);
        uint256 tid = desk.propose(id, t);
        assertEq(desk.checkExecute(tid), M.R_NOT_APPROVED);
        bytes32 h = desk.getTicket(tid).hash;
        vm.prank(owner);
        desk.approve(tid, h);
        assertEq(desk.checkExecute(tid), 0);
        uint256 usdBefore = IForkERC20(USDG).balanceOf(owner);
        uint256 nvdaBefore = IForkERC20(NVDA).balanceOf(owner);
        vm.prank(agent);
        uint256 gasBefore = gasleft();
        uint256 out = desk.execute(tid);
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("execute gas (fork)", gasUsed);
        assertGt(out, 0);
        assertEq(IForkERC20(NVDA).balanceOf(owner) - nvdaBefore, out);
        assertEq(usdBefore - IForkERC20(USDG).balanceOf(owner), 25e6);
        assertEq(IForkERC20(USDG).balanceOf(address(desk)), 0);
        assertEq(IForkERC20(NVDA).balanceOf(address(desk)), 0);
        assertEq(IForkERC20(USDG).allowance(address(desk), ROUTER), 0);
        assertEq(desk.getTicket(tid).amountOut, out);
    }

    function test_fork_minOutTooHigh_reverts() public {
        uint256 id = _open();
        // 25 USDG can never buy 1000 NVDA tokens.
        OddroOrderDesk.TicketInput memory t = _input(NVDA, 25e6, 1000e18);
        vm.prank(agent);
        uint256 tid = desk.propose(id, t);
        bytes32 h = desk.getTicket(tid).hash;
        vm.prank(owner);
        desk.approve(tid, h);
        vm.prank(agent);
        vm.expectRevert();
        desk.execute(tid);
        assertEq(uint8(desk.getTicket(tid).status), uint8(OddroOrderDesk.Status.Approved));
    }

    function test_fork_wrongAsset_refused() public {
        uint256 id = _open();
        OddroOrderDesk.TicketInput memory t = _input(AAPL, 25e6, 1);
        assertEq(desk.checkTicket(id, agent, t), M.R_WRONG_ASSET);
    }

    function test_fork_overCap_refused() public {
        uint256 id = _open();
        assertEq(desk.checkTicket(id, agent, _input(NVDA, 60e6, 1)), M.R_OVER_TICKET_CAP);
    }
}
