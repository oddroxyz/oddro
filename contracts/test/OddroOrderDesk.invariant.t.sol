// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OddroOrderDesk} from "../src/OddroOrderDesk.sol";
import {OddroTestToken, OddroMockRouter} from "./OddroMocks.sol";

/// @notice Random agents, owners and strangers propose, decide, cancel, expire and execute on one desk across many periods.
contract OddroDeskActor is Test {
    OddroOrderDesk public desk;
    OddroTestToken public usd;
    OddroTestToken public stock;
    OddroMockRouter public router;
    uint256 public id;
    address public owner = address(0xA11CE);
    address public agent = address(0xB0B);
    address public stranger = address(0x5745);
    bytes32 public constant RULES = keccak256("rules");

    uint128 public constant PER_TICKET = 50e6;
    uint128 public constant PER_PERIOD = 120e6;
    uint32 public constant PERIOD = 7 days;

    uint256[] public tickets;
    mapping(uint256 => bool) public everApproved;
    mapping(uint64 => uint256) public approvedIn; // period => amount approved in it (net of releases)
    uint256 public executedWithoutApproval;
    uint256 public strangerWins;
    uint256 public movedWhilePaused;
    uint256 public executions;

    constructor() {
        vm.warp(1_800_000_000);
        router = new OddroMockRouter();
        desk = new OddroOrderDesk(address(router));
        usd = new OddroTestToken("U", "U", 6);
        stock = new OddroTestToken("S", "S", 18);
        usd.mint(owner, 1e15);
        vm.prank(owner);
        usd.approve(address(desk), type(uint256).max);
        OddroOrderDesk.DeskInit memory i;
        i.agent = agent;
        i.asset = address(stock);
        i.quote = address(usd);
        i.fee = 3000;
        i.maxPerTicket = PER_TICKET;
        i.periodCap = PER_PERIOD;
        i.periodLength = PERIOD;
        i.minGap = 6 hours;
        i.maxTicketLife = 3 days;
        i.expiry = uint64(block.timestamp + 700 days);
        i.ruleHash = RULES;
        vm.prank(owner);
        id = desk.openDesk(i);
    }

    function ticketCount() external view returns (uint256) {
        return tickets.length;
    }

    function _pick(uint256 seed) internal view returns (uint256) {
        return tickets.length == 0 ? 0 : tickets[seed % tickets.length];
    }

    function propose(uint256 amount, uint256 life, uint256 who) external {
        OddroOrderDesk.TicketInput memory t;
        t.asset = address(stock);
        t.amountIn = uint128(bound(amount, 0, 80e6));
        t.minOut = 1;
        t.deadline = uint64(block.timestamp + bound(life, 0, 4 days));
        t.ruleHash = RULES;
        address caller = who % 5 == 0 ? stranger : agent;
        vm.prank(caller);
        try desk.propose(id, t) returns (uint256 tid) {
            tickets.push(tid);
            if (caller == stranger) strangerWins++;
        } catch {}
    }

    function approve(uint256 seed, uint256 who) external {
        uint256 tid = _pick(seed);
        if (tid == 0) return;
        bytes32 h = desk.getTicket(tid).hash;
        address caller = who % 4 == 0 ? agent : owner;
        vm.prank(caller);
        try desk.approve(tid, h) {
            if (caller != owner) strangerWins++;
            everApproved[tid] = true;
            OddroOrderDesk.Ticket memory t = desk.getTicket(tid);
            approvedIn[t.period] += t.amountIn;
        } catch {}
    }

    function reject(uint256 seed) external {
        uint256 tid = _pick(seed);
        if (tid == 0) return;
        vm.prank(owner);
        try desk.reject(tid, 1) {} catch {}
    }

    function cancel(uint256 seed, bool byOwner) external {
        uint256 tid = _pick(seed);
        if (tid == 0) return;
        OddroOrderDesk.Ticket memory before = desk.getTicket(tid);
        vm.prank(byOwner ? owner : agent);
        try desk.cancel(tid) {
            _released(before);
        } catch {}
    }

    function expire(uint256 seed) external {
        uint256 tid = _pick(seed);
        if (tid == 0) return;
        OddroOrderDesk.Ticket memory before = desk.getTicket(tid);
        try desk.expire(tid) {
            _released(before);
        } catch {}
    }

    function _released(OddroOrderDesk.Ticket memory t) internal {
        if (t.status != OddroOrderDesk.Status.Approved) return;
        (uint64 p,,) = desk.periodUse(id);
        // the contract only gives the amount back when the ticket's period is still the stored one
        if (t.period == p) approvedIn[t.period] -= t.amountIn;
    }

    function execute(uint256 seed, bool byOwner) external {
        uint256 tid = _pick(seed);
        if (tid == 0) return;
        bool paused = desk.getDesk(id).paused;
        uint256 before = stock.balanceOf(owner);
        vm.prank(byOwner ? owner : agent);
        try desk.execute(tid) {
            executions++;
            if (!everApproved[tid]) executedWithoutApproval++;
            if (paused) movedWhilePaused += stock.balanceOf(owner) - before;
        } catch {}
    }

    function pauseToggle(bool on) external {
        vm.prank(owner);
        if (on) desk.pause(id);
        else desk.unpause(id);
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1 minutes, 3 days));
    }
}

contract OddroOrderDeskInvariantTest is Test {
    OddroDeskActor actor;

    function setUp() public {
        actor = new OddroDeskActor();
        targetContract(address(actor));
    }

    /// The desk never keeps a balance and never leaves an allowance to the router.
    function invariant_holdsNothing() public view {
        OddroOrderDesk d = actor.desk();
        assertEq(actor.usd().balanceOf(address(d)), 0);
        assertEq(actor.usd().allowance(address(d), address(actor.router())), 0);
    }

    /// Reserved amount of the current period never exceeds the period cap and matches the approvals made in it.
    function invariant_periodUseMatchesApprovals() public view {
        OddroOrderDesk d = actor.desk();
        uint256 id = actor.id();
        (uint64 p, uint128 used,) = d.periodUse(id);
        assertLe(used, actor.PER_PERIOD());
        assertEq(used, actor.approvedIn(p));
    }

    /// Nothing is bought without the owner's approval, no stranger ever succeeds, nothing moves while paused.
    function invariant_manualApprovalIsTheOnlyPath() public view {
        assertEq(actor.executedWithoutApproval(), 0);
        assertEq(actor.strangerWins(), 0);
        assertEq(actor.movedWhilePaused(), 0);
    }
}
