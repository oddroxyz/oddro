// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {OddroOrderDesk} from "../src/OddroOrderDesk.sol";

/// @notice Plain ERC-20 for tests.
contract OddroTestToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
        totalSupply += v;
    }

    function approve(address s, uint256 v) public virtual returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transfer(address to, uint256 v) public virtual returns (bool) {
        _move(msg.sender, to, v);
        return true;
    }

    function transferFrom(address f, address to, uint256 v) public virtual returns (bool) {
        uint256 a = allowance[f][msg.sender];
        require(a >= v, "allowance");
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        _move(f, to, v);
        return true;
    }

    function _move(address f, address to, uint256 v) internal virtual {
        require(balanceOf[f] >= v, "balance");
        balanceOf[f] -= v;
        balanceOf[to] += v;
    }
}

/// @notice USDT-style: no return values, approve must go through zero.
contract OddroNoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
    }

    function approve(address s, uint256 v) external {
        require(v == 0 || allowance[msg.sender][s] == 0, "approve via zero");
        allowance[msg.sender][s] = v;
    }

    function transfer(address to, uint256 v) external {
        require(balanceOf[msg.sender] >= v, "balance");
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
    }

    function transferFrom(address f, address to, uint256 v) external {
        require(allowance[f][msg.sender] >= v && balanceOf[f] >= v, "nope");
        allowance[f][msg.sender] -= v;
        balanceOf[f] -= v;
        balanceOf[to] += v;
    }
}

/// @notice Returns false instead of reverting.
contract OddroFalseToken is OddroTestToken("False", "FALSE", 6) {
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

/// @notice Takes 1% on every move.
contract OddroFeeToken is OddroTestToken("Fee", "FEE", 6) {
    function _move(address f, address to, uint256 v) internal override {
        require(balanceOf[f] >= v, "balance");
        uint256 fee = v / 100;
        balanceOf[f] -= v;
        balanceOf[to] += v - fee;
        balanceOf[address(0xdead)] += fee;
    }
}

/// @notice Calls back into the desk during transferFrom (execute again, cancel, approve).
contract OddroReentrantToken is OddroTestToken("Re", "RE", 6) {
    OddroOrderDesk public desk;
    uint256 public ticketId;
    uint8 public mode; // 1 execute again, 2 cancel
    bool public attacked;
    bytes public lastError;

    function arm(OddroOrderDesk d, uint256 id, uint8 m) external {
        desk = d;
        ticketId = id;
        mode = m;
    }

    function transferFrom(address f, address t, uint256 v) public override returns (bool) {
        if (address(desk) != address(0) && !attacked) {
            attacked = true;
            if (mode == 1) {
                try desk.execute(ticketId) {} catch (bytes memory e) {
                    lastError = e;
                }
            } else {
                try desk.cancel(ticketId) {} catch (bytes memory e) {
                    lastError = e;
                }
            }
        }
        return super.transferFrom(f, t, v);
    }
}

/// @notice SwapRouter02-shaped router: pulls amountIn, pays `rate` tokenOut per tokenIn (1e18 scale) to the recipient.
contract OddroMockRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    uint256 public rate = 2e18;
    uint256 public pullBps = 10_000;
    bool public payElsewhere;
    address public lastRecipient;
    uint24 public lastFee;

    function setRate(uint256 r) external {
        rate = r;
    }

    function setPullBps(uint256 b) external {
        pullBps = b;
    }

    function setPayElsewhere(bool v) external {
        payElsewhere = v;
    }

    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 out) {
        uint256 pull = (p.amountIn * pullBps) / 10_000;
        (bool ok,) = p.tokenIn.call(abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), pull));
        require(ok, "pull");
        out = (p.amountIn * rate) / 1e18;
        lastRecipient = p.recipient;
        lastFee = p.fee;
        OddroTestToken(p.tokenOut).mint(payElsewhere ? address(0xbeef) : p.recipient, out);
        require(payElsewhere || out >= p.amountOutMinimum, "Too little received");
    }
}
