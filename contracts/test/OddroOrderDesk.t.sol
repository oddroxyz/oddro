// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OddroOrderDesk} from "../src/OddroOrderDesk.sol";
import {OddroTicketMath as M} from "../src/OddroTicketMath.sol";
import {
    OddroTestToken,
    OddroNoReturnToken,
    OddroFalseToken,
    OddroFeeToken,
    OddroReentrantToken,
    OddroMockRouter
} from "./OddroMocks.sol";

contract OddroOrderDeskTest is Test {
    OddroOrderDesk desk;
    OddroMockRouter router;
    OddroTestToken usd;
    OddroTestToken stock;
    OddroTestToken other;
    address owner = makeAddr("oddro-owner");
    address agent = makeAddr("oddro-agent");
    address stranger = makeAddr("oddro-stranger");
    bytes32 constant RULES = keccak256("weekly 50 USDG of NVDA, approve every ticket");

    uint128 constant PER_TICKET = 50e6;
    uint128 constant PER_PERIOD = 120e6;

    function setUp() public {
        vm.warp(1_800_000_000);
        router = new OddroMockRouter();
        desk = new OddroOrderDesk(address(router));
        usd = new OddroTestToken("Dollar", "USD", 6);
        stock = new OddroTestToken("Stock", "STK", 18);
        other = new OddroTestToken("Other", "OTH", 18);
        usd.mint(owner, 10_000e6);
        vm.prank(owner);
        usd.approve(address(desk), type(uint256).max);
    }

    // ------------------------------------------------------------------ helpers

    function _init() internal view returns (OddroOrderDesk.DeskInit memory i) {
        i.agent = agent;
        i.asset = address(stock);
        i.quote = address(usd);
        i.fee = 500;
        i.maxPerTicket = PER_TICKET;
        i.periodCap = PER_PERIOD;
        i.periodLength = 7 days;
        i.minGap = 1 days;
        i.maxTicketLife = 2 days;
        i.expiry = uint64(block.timestamp + 90 days);
        i.ruleHash = RULES;
    }

    function _open() internal returns (uint256 id) {
        vm.prank(owner);
        id = desk.openDesk(_init());
    }

    function _input(uint128 amount) internal view returns (OddroOrderDesk.TicketInput memory t) {
        t.asset = address(stock);
        t.amountIn = amount;
        t.minOut = 1;
        t.deadline = uint64(block.timestamp + 1 days);
        t.ruleHash = RULES;
        t.ref = bytes32("weekly-buy");
    }

    function _propose(uint256 id, uint128 amount) internal returns (uint256 tid) {
        OddroOrderDesk.TicketInput memory t = _input(amount);
        vm.prank(agent);
        tid = desk.propose(id, t);
    }

    function _approve(uint256 tid) internal {
        bytes32 h = desk.getTicket(tid).hash;
        vm.prank(owner);
        desk.approve(tid, h);
    }

    // ------------------------------------------------------------------ opening

    function test_openDesk_storesEverything() public {
        uint256 id = _open();
        OddroOrderDesk.Desk memory d = desk.getDesk(id);
        assertEq(d.owner, owner);
        assertEq(d.agent, agent);
        assertEq(d.asset, address(stock));
        assertEq(d.maxPerTicket, PER_TICKET);
        assertEq(d.version, 1);
        assertEq(desk.desksOfOwner(owner)[0], id);
        assertEq(desk.desksOfAgent(agent)[0], id);
        assertEq(desk.ROUTER(), address(router));
    }

    function test_openDesk_refusesBadInput() public {
        OddroOrderDesk.DeskInit memory i = _init();
        i.maxPerTicket = PER_PERIOD + 1;
        vm.prank(owner);
        vm.expectRevert(OddroOrderDesk.BadDesk.selector);
        desk.openDesk(i);

        i = _init();
        i.asset = address(usd);
        vm.prank(owner);
        vm.expectRevert(OddroOrderDesk.BadDesk.selector);
        desk.openDesk(i);

        i = _init();
        i.asset = makeAddr("no-code");
        vm.prank(owner);
        vm.expectRevert(OddroOrderDesk.BadDesk.selector);
        desk.openDesk(i);

        i = _init();
        i.fee = 1234;
        vm.prank(owner);
        vm.expectRevert(OddroOrderDesk.BadDesk.selector);
        desk.openDesk(i);

        i = _init();
        i.periodLength = 10 minutes;
        vm.prank(owner);
        vm.expectRevert(OddroOrderDesk.BadDesk.selector);
        desk.openDesk(i);

        i = _init();
        i.expiry = uint64(block.timestamp + 800 days);
        vm.prank(owner);
        vm.expectRevert(OddroOrderDesk.BadDesk.selector);
        desk.openDesk(i);

        i = _init();
        i.ruleHash = bytes32(0);
        vm.prank(owner);
        vm.expectRevert(OddroOrderDesk.BadDesk.selector);
        desk.openDesk(i);
    }

    function test_constructor_needsRouterCode() public {
        vm.expectRevert(OddroOrderDesk.BadDesk.selector);
        new OddroOrderDesk(makeAddr("eoa-router"));
    }

    // ------------------------------------------------------------------ the four scenarios of the review desk

    function test_scenario_withinBudget_isClean() public {
        uint256 id = _open();
        assertEq(desk.checkTicket(id, agent, _input(40e6)), 0);
        uint256 tid = _propose(id, 40e6);
        assertEq(uint8(desk.getTicket(tid).status), uint8(OddroOrderDesk.Status.Proposed));
        assertEq(desk.checkDecision(tid), 0);
    }

    function test_scenario_overCap_isRefused() public {
        uint256 id = _open();
        uint256 bits = desk.checkTicket(id, agent, _input(PER_TICKET + 1));
        assertEq(bits, M.R_OVER_TICKET_CAP);
        OddroOrderDesk.TicketInput memory t = _input(PER_TICKET + 1);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(OddroOrderDesk.Refused.selector, M.R_OVER_TICKET_CAP));
        desk.propose(id, t);
    }

    function test_scenario_wrongAsset_isRefused() public {
        uint256 id = _open();
        OddroOrderDesk.TicketInput memory t = _input(10e6);
        t.asset = address(other);
        assertEq(desk.checkTicket(id, agent, t), M.R_WRONG_ASSET);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(OddroOrderDesk.Refused.selector, M.R_WRONG_ASSET));
        desk.propose(id, t);
    }

    function test_scenario_notApproved_cannotExecute() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 10e6);
        assertEq(desk.checkExecute(tid), M.R_NOT_APPROVED);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(OddroOrderDesk.Refused.selector, M.R_NOT_APPROVED));
        desk.execute(tid);
    }

    // ------------------------------------------------------------------ proposals

    function test_propose_onlyAgent() public {
        uint256 id = _open();
        assertEq(desk.checkTicket(id, stranger, _input(10e6)), M.R_NOT_AGENT);
        OddroOrderDesk.TicketInput memory t = _input(10e6);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OddroOrderDesk.Refused.selector, M.R_NOT_AGENT));
        desk.propose(id, t);
    }

    function test_propose_unknownDesk() public view {
        assertEq(desk.checkTicket(99, agent, _input(10e6)), M.R_UNKNOWN_DESK);
    }

    function test_propose_deadlineRules() public {
        uint256 id = _open();
        OddroOrderDesk.TicketInput memory t = _input(10e6);
        t.deadline = uint64(block.timestamp - 1);
        assertEq(desk.checkTicket(id, agent, t), M.R_DEADLINE_PASSED);
        t.deadline = uint64(block.timestamp + 3 days);
        assertEq(desk.checkTicket(id, agent, t), M.R_DEADLINE_TOO_FAR);
    }

    function test_propose_zeroAndNoMinOutAndRules() public {
        uint256 id = _open();
        OddroOrderDesk.TicketInput memory t = _input(0);
        assertEq(desk.checkTicket(id, agent, t), M.R_ZERO_AMOUNT);
        t = _input(10e6);
        t.minOut = 0;
        assertEq(desk.checkTicket(id, agent, t), M.R_NO_MIN_OUT);
        t = _input(10e6);
        t.ruleHash = keccak256("other rules");
        assertEq(desk.checkTicket(id, agent, t), M.R_RULES_CHANGED);
    }

    function test_propose_severalBitsAtOnce() public {
        uint256 id = _open();
        OddroOrderDesk.TicketInput memory t = _input(PER_PERIOD + 1);
        t.asset = address(other);
        t.minOut = 0;
        uint256 bits = desk.checkTicket(id, stranger, t);
        assertEq(bits, M.R_NOT_AGENT | M.R_WRONG_ASSET | M.R_OVER_TICKET_CAP | M.R_OVER_PERIOD_CAP | M.R_NO_MIN_OUT);
    }

    function test_ticketHash_bindsFields() public {
        uint256 id = _open();
        uint256 a = _propose(id, 10e6);
        uint256 b = _propose(id, 10e6);
        assertTrue(desk.getTicket(a).hash != desk.getTicket(b).hash);
        OddroOrderDesk.Ticket memory t = desk.getTicket(a);
        bytes32 expect = keccak256(
            abi.encode(
                block.chainid, address(desk), a, id, t.asset, uint256(t.amountIn), uint256(t.minOut), t.deadline, t.ruleHash, t.ref
            )
        );
        assertEq(t.hash, expect);
    }

    // ------------------------------------------------------------------ manual decisions

    function test_approve_onlyOwner_withExactHash() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 40e6);
        bytes32 h = desk.getTicket(tid).hash;
        vm.prank(agent);
        vm.expectRevert(OddroOrderDesk.NotOwner.selector);
        desk.approve(tid, h);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OddroOrderDesk.HashMismatch.selector, bytes32("x"), h));
        desk.approve(tid, bytes32("x"));
        vm.prank(owner);
        desk.approve(tid, h);
        OddroOrderDesk.Ticket memory t = desk.getTicket(tid);
        assertEq(uint8(t.status), uint8(OddroOrderDesk.Status.Approved));
        (, uint128 used, uint128 left) = desk.periodUse(id);
        assertEq(used, 40e6);
        assertEq(left, PER_PERIOD - 40e6);
    }

    function test_approve_twiceRefused() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 40e6);
        _approve(tid);
        bytes32 h = desk.getTicket(tid).hash;
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OddroOrderDesk.Refused.selector, M.R_NOT_PENDING | M.R_TOO_SOON));
        desk.approve(tid, h);
    }

    function test_minGap_betweenApprovals() public {
        uint256 id = _open();
        uint256 a = _propose(id, 40e6);
        uint256 b = _propose(id, 40e6);
        _approve(a);
        assertEq(desk.checkDecision(b), M.R_TOO_SOON);
        vm.warp(block.timestamp + 1 days);
        assertEq(desk.checkDecision(b), 0);
        _approve(b);
    }

    function test_periodCap_acrossApprovals_andReset() public {
        uint256 id = _open();
        uint256 a = _propose(id, 50e6);
        _approve(a);
        vm.warp(block.timestamp + 1 days);
        uint256 b = _propose(id, 50e6);
        _approve(b);
        vm.warp(block.timestamp + 1 days);
        // 100 used of 120: a 50 ticket can no longer be proposed or approved this period.
        assertEq(desk.checkTicket(id, agent, _input(50e6)), M.R_OVER_PERIOD_CAP);
        uint256 c = _propose(id, 20e6);
        _approve(c);
        (, uint128 used,) = desk.periodUse(id);
        assertEq(used, PER_PERIOD);
        // next period starts fresh
        vm.warp(desk.getDesk(id).start + 7 days);
        (, used,) = desk.periodUse(id);
        assertEq(used, 0);
        assertEq(desk.checkTicket(id, agent, _input(50e6)), 0);
    }

    function test_reject_recordsCode() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 40e6);
        vm.prank(stranger);
        vm.expectRevert(OddroOrderDesk.NotOwner.selector);
        desk.reject(tid, 3);
        vm.prank(owner);
        desk.reject(tid, 3);
        OddroOrderDesk.Ticket memory t = desk.getTicket(tid);
        assertEq(uint8(t.status), uint8(OddroOrderDesk.Status.Rejected));
        assertEq(t.rejectCode, 3);
        assertEq(desk.checkDecision(tid), M.R_NOT_PENDING);
    }

    function test_cancelApproved_releasesReservation() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 50e6);
        _approve(tid);
        vm.prank(stranger);
        vm.expectRevert(OddroOrderDesk.NotOwnerOrAgent.selector);
        desk.cancel(tid);
        vm.prank(agent);
        desk.cancel(tid);
        (, uint128 used,) = desk.periodUse(id);
        assertEq(used, 0);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(OddroOrderDesk.WrongStatus.selector, OddroOrderDesk.Status.Cancelled));
        desk.cancel(tid);
    }

    function test_expire_afterDeadlineOnly() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 50e6);
        _approve(tid);
        vm.expectRevert(OddroOrderDesk.NotExpiredYet.selector);
        desk.expire(tid);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(stranger);
        desk.expire(tid);
        assertEq(uint8(desk.getTicket(tid).status), uint8(OddroOrderDesk.Status.Expired));
        (, uint128 used,) = desk.periodUse(id);
        assertEq(used, 0);
    }

    function test_releaseInLaterPeriod_doesNotTouchNewPeriod() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 50e6);
        _approve(tid);
        vm.warp(desk.getDesk(id).start + 7 days + 1);
        uint256 b = _propose(id, 30e6);
        _approve(b);
        vm.prank(owner);
        desk.cancel(tid);
        (, uint128 used,) = desk.periodUse(id);
        assertEq(used, 30e6);
    }

    function test_updateRules_blocksOldTickets() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 40e6);
        vm.prank(owner);
        desk.updateRules(id, keccak256("v2"), 30e6, 100e6, 0);
        assertEq(desk.getDesk(id).version, 2);
        assertEq(desk.checkDecision(tid), M.R_RULES_CHANGED | M.R_OVER_TICKET_CAP);
        vm.prank(agent);
        vm.expectRevert(OddroOrderDesk.NotOwner.selector);
        desk.updateRules(id, keccak256("v3"), 1, 1, 0);
    }

    // ------------------------------------------------------------------ pause / close

    function test_pause_sameBlock_blocksEverything() public {
        uint256 id = _open();
        uint256 a = _propose(id, 40e6);
        uint256 b = _propose(id, 10e6);
        _approve(b);
        vm.prank(owner);
        desk.pause(id);
        // b was just approved, so the gap rule fires as well
        assertEq(desk.checkTicket(id, agent, _input(10e6)), M.R_DESK_PAUSED | M.R_TOO_SOON);
        assertEq(desk.checkDecision(a), M.R_DESK_PAUSED | M.R_TOO_SOON);
        assertEq(desk.checkExecute(b), M.R_DESK_PAUSED);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(OddroOrderDesk.Refused.selector, M.R_DESK_PAUSED));
        desk.execute(b);
        vm.prank(owner);
        desk.unpause(id);
        assertEq(desk.checkExecute(b), 0);
    }

    function test_agentPause_cannotUnpause() public {
        uint256 id = _open();
        vm.prank(agent);
        desk.agentPause(id);
        assertTrue(desk.getDesk(id).paused);
        vm.prank(agent);
        vm.expectRevert(OddroOrderDesk.NotOwner.selector);
        desk.unpause(id);
        vm.prank(stranger);
        vm.expectRevert(OddroOrderDesk.NotAgent.selector);
        desk.agentPause(id);
    }

    function test_close_isFinal() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 40e6);
        _approve(tid);
        vm.prank(owner);
        desk.close(id);
        assertEq(desk.checkExecute(tid) & M.R_DESK_CLOSED, M.R_DESK_CLOSED);
        vm.prank(owner);
        vm.expectRevert(OddroOrderDesk.BadDesk.selector);
        desk.unpause(id);
        vm.prank(owner);
        desk.cancel(tid);
    }

    function test_expiredDesk() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 91 days);
        assertEq(desk.checkTicket(id, agent, _input(10e6)) & M.R_DESK_EXPIRED, M.R_DESK_EXPIRED);
    }

    // ------------------------------------------------------------------ execution

    function test_execute_paysOwner_andHoldsNothing() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 40e6);
        _approve(tid);
        assertEq(desk.checkExecute(tid), 0);
        vm.prank(agent);
        uint256 out = desk.execute(tid);
        assertEq(out, 80e6);
        assertEq(stock.balanceOf(owner), 80e6);
        assertEq(router.lastRecipient(), owner);
        assertEq(router.lastFee(), 500);
        assertEq(usd.balanceOf(address(desk)), 0);
        assertEq(usd.allowance(address(desk), address(router)), 0);
        OddroOrderDesk.Ticket memory t = desk.getTicket(tid);
        assertEq(uint8(t.status), uint8(OddroOrderDesk.Status.Executed));
        assertEq(t.amountOut, 80e6);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(OddroOrderDesk.Refused.selector, M.R_NOT_APPROVED));
        desk.execute(tid);
    }

    function test_execute_strangerRefused() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 40e6);
        _approve(tid);
        vm.prank(stranger);
        vm.expectRevert(OddroOrderDesk.NotOwnerOrAgent.selector);
        desk.execute(tid);
    }

    function test_execute_minOutEnforced() public {
        uint256 id = _open();
        OddroOrderDesk.TicketInput memory t = _input(40e6);
        t.minOut = 81e6;
        vm.prank(agent);
        uint256 tid = desk.propose(id, t);
        _approve(tid);
        vm.prank(agent);
        vm.expectRevert(bytes("Too little received"));
        desk.execute(tid);
    }

    function test_execute_lyingRouterCaught() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 40e6);
        _approve(tid);
        router.setPayElsewhere(true);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(OddroOrderDesk.SwapShortfall.selector, 0, 1));
        desk.execute(tid);
    }

    function test_execute_routerLeavesLeftover() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 40e6);
        _approve(tid);
        router.setPullBps(9_000);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(OddroOrderDesk.LeftoverBalance.selector, 4e6));
        desk.execute(tid);
    }

    function test_execute_lowAllowanceAndBalanceBits() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 40e6);
        _approve(tid);
        vm.prank(owner);
        usd.approve(address(desk), 1);
        assertEq(desk.checkExecute(tid), M.R_LOW_ALLOWANCE);
        vm.startPrank(owner);
        usd.approve(address(desk), type(uint256).max);
        usd.transfer(stranger, usd.balanceOf(owner));
        vm.stopPrank();
        assertEq(desk.checkExecute(tid), M.R_LOW_BALANCE);
    }

    function test_execute_afterDeadlineRefused() public {
        uint256 id = _open();
        uint256 tid = _propose(id, 40e6);
        _approve(tid);
        vm.warp(block.timestamp + 1 days + 1);
        assertEq(desk.checkExecute(tid), M.R_DEADLINE_PASSED);
    }

    // ------------------------------------------------------------------ hostile quote tokens

    function _deskWith(address quote) internal returns (uint256 id) {
        OddroOrderDesk.DeskInit memory i = _init();
        i.quote = quote;
        vm.prank(owner);
        id = desk.openDesk(i);
    }

    function test_hostile_noReturnToken_works() public {
        OddroNoReturnToken q = new OddroNoReturnToken();
        q.mint(owner, 1_000e6);
        vm.prank(owner);
        q.approve(address(desk), type(uint256).max);
        uint256 id = _deskWith(address(q));
        uint256 tid = _propose(id, 40e6);
        _approve(tid);
        vm.prank(owner);
        desk.execute(tid);
        assertEq(q.balanceOf(address(desk)), 0);
        assertEq(q.allowance(address(desk), address(router)), 0);
    }

    function test_hostile_falseToken_refused() public {
        OddroFalseToken q = new OddroFalseToken();
        q.mint(owner, 1_000e6);
        vm.prank(owner);
        q.approve(address(desk), type(uint256).max);
        uint256 id = _deskWith(address(q));
        uint256 tid = _propose(id, 40e6);
        _approve(tid);
        vm.prank(owner);
        vm.expectRevert(OddroOrderDesk.TransferFailed.selector);
        desk.execute(tid);
    }

    function test_hostile_feeToken_refused() public {
        OddroFeeToken q = new OddroFeeToken();
        q.mint(owner, 1_000e6);
        vm.prank(owner);
        q.approve(address(desk), type(uint256).max);
        uint256 id = _deskWith(address(q));
        uint256 tid = _propose(id, 40e6);
        _approve(tid);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OddroOrderDesk.FeeOnTransferNotSupported.selector, 40e6, 39.6e6));
        desk.execute(tid);
    }

    function test_hostile_reentrantExecute_blocked() public {
        OddroReentrantToken q = new OddroReentrantToken();
        q.mint(owner, 1_000e6);
        vm.prank(owner);
        q.approve(address(desk), type(uint256).max);
        uint256 id = _deskWith(address(q));
        uint256 tid = _propose(id, 40e6);
        _approve(tid);
        q.arm(desk, tid, 1);
        vm.prank(owner);
        desk.execute(tid);
        assertEq(bytes4(q.lastError()), OddroOrderDesk.Reentrancy.selector);
        assertEq(stock.balanceOf(owner), 80e6);
    }

    function test_hostile_reentrantCancel_blocked() public {
        OddroReentrantToken q = new OddroReentrantToken();
        q.mint(owner, 1_000e6);
        vm.prank(owner);
        q.approve(address(desk), type(uint256).max);
        uint256 id = _deskWith(address(q));
        uint256 tid = _propose(id, 40e6);
        _approve(tid);
        q.arm(desk, tid, 2);
        vm.prank(owner);
        desk.execute(tid);
        // the token is not owner or agent, and the ticket is already Executed
        assertEq(bytes4(q.lastError()), OddroOrderDesk.NotOwnerOrAgent.selector);
        assertEq(uint8(desk.getTicket(tid).status), uint8(OddroOrderDesk.Status.Executed));
    }

    // ------------------------------------------------------------------ pagination

    function test_ticketsOf_pages() public {
        uint256 id = _open();
        for (uint256 k; k < 5; ++k) {
            _propose(id, 1e6);
        }
        assertEq(desk.ticketCountOf(id), 5);
        uint256[] memory p = desk.ticketsOf(id, 3, 10);
        assertEq(p.length, 2);
        assertEq(p[0], 4);
        assertEq(desk.ticketsOf(id, 9, 10).length, 0);
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_checkTicketMatchesPropose(uint128 amount, uint64 life, bool wrongAsset, bool zeroMin) public {
        uint256 id = _open();
        OddroOrderDesk.TicketInput memory t = _input(uint128(bound(amount, 0, 300e6)));
        t.deadline = uint64(block.timestamp + bound(life, 0, 4 days));
        if (wrongAsset) t.asset = address(other);
        if (zeroMin) t.minOut = 0;
        uint256 bits = desk.checkTicket(id, agent, t);
        vm.prank(agent);
        if (bits == 0) {
            desk.propose(id, t);
        } else {
            vm.expectRevert(abi.encodeWithSelector(OddroOrderDesk.Refused.selector, bits));
            desk.propose(id, t);
        }
    }

    function testFuzz_amountBits(uint256 amount, uint128 cap, uint128 periodCap, uint128 used) public pure {
        cap = uint128(bound(cap, 1, type(uint64).max));
        periodCap = uint128(bound(periodCap, cap, type(uint64).max));
        used = uint128(bound(used, 0, periodCap));
        uint256 bits = M.amountBits(amount, cap, periodCap, used);
        if (amount == 0) {
            assertEq(bits, M.R_ZERO_AMOUNT);
        } else {
            assertEq(bits & M.R_OVER_TICKET_CAP != 0, amount > cap);
            assertEq(bits & M.R_OVER_PERIOD_CAP != 0, amount > uint256(periodCap) - used);
        }
    }

    function testFuzz_periodOf(uint64 start, uint32 len, uint64 dt) public pure {
        len = uint32(bound(len, 1 hours, 366 days));
        start = uint64(bound(start, 0, type(uint32).max));
        uint256 t = uint256(start) + dt;
        uint64 p = M.periodOf(start, len, t);
        assertLe(uint256(p) * len, uint256(dt));
        assertGt((uint256(p) + 1) * len, uint256(dt));
    }
}
