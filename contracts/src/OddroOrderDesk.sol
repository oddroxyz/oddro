// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {OddroTicketMath as M} from "./OddroTicketMath.sol";

interface IOddroERC20 {
    function balanceOf(address) external view returns (uint256);
    function allowance(address, address) external view returns (uint256);
}

/// @notice Uniswap v3 SwapRouter02 exactInputSingle (the build on Robinhood Chain has no deadline field).
interface IOddroSwapRouter02 {
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
}

/// @title OddroOrderDesk
/// @notice An order review desk for one periodic-buy strategy per desk. The owner opens a desk for one agent address and one
/// asset with a quote token, a per-ticket cap, a cap per fixed period, a minimum gap between approvals and a rule hash. The
/// agent proposes order tickets; every ticket waits for the owner's manual approve or reject on chain. Nothing is bought
/// unless the owner approved that exact ticket (its hash), and checkTicket / checkDecision / checkExecute tell why a ticket
/// would fail before anyone signs.
///
/// Execution (optional): an approved ticket can be executed by the owner or the agent before its deadline. The quote
/// token moves owner -> this contract -> the router in the same transaction and the swap output is sent straight to the
/// owner (recipient forced, min-out enforced, received amount measured, router approval reset, leftovers refused).
///
/// Non-custodial: no balance is held between transactions. No admin, no fee, no upgrade, not payable. Native ETH is not
/// supported. Fee-on-transfer quote tokens are refused; tokens that return nothing on transfer are accepted.
contract OddroOrderDesk {
    // =========================================================================================================
    // Types
    // =========================================================================================================

    enum Status {
        None,
        Proposed,
        Approved,
        Rejected,
        Cancelled,
        Expired,
        Executed
    }

    struct Desk {
        address owner;
        address agent;
        address asset;
        address quote;
        uint24 fee;
        uint32 periodLength;
        uint32 minGap;
        uint32 maxTicketLife;
        uint64 start;
        uint64 expiry;
        uint64 lastApprovedAt;
        uint128 maxPerTicket;
        uint128 periodCap;
        bytes32 ruleHash;
        uint32 version;
        bool paused;
        bool closed;
    }

    struct DeskInit {
        address agent;
        address asset;
        address quote;
        uint24 fee;
        uint128 maxPerTicket;
        uint128 periodCap;
        uint32 periodLength;
        uint32 minGap;
        uint32 maxTicketLife;
        uint64 expiry;
        bytes32 ruleHash;
    }

    struct TicketInput {
        address asset;
        uint128 amountIn;
        uint128 minOut;
        uint64 deadline;
        bytes32 ruleHash;
        bytes32 ref;
    }

    struct Ticket {
        uint64 deskId;
        uint64 deadline;
        uint64 proposedAt;
        uint64 decidedAt;
        uint64 period;
        Status status;
        uint16 rejectCode;
        address asset;
        uint128 amountIn;
        uint128 minOut;
        uint128 amountOut;
        bytes32 ruleHash;
        bytes32 ref;
        bytes32 hash;
    }

    struct PeriodUse {
        uint64 period;
        uint128 used;
    }

    // =========================================================================================================
    // Storage
    // =========================================================================================================

    /// @notice The only router tickets are executed through (Uniswap v3 SwapRouter02 on Robinhood Chain in production).
    address public immutable ROUTER;

    uint64 public deskCount;
    uint64 public ticketCount;

    mapping(uint256 => Desk) internal _desks;
    mapping(uint256 => Ticket) internal _tickets;
    mapping(uint256 => PeriodUse) internal _use;
    mapping(uint256 => uint256[]) internal _ticketsOf;
    mapping(address => uint256[]) internal _byOwner;
    mapping(address => uint256[]) internal _byAgent;

    uint256 private _lock = 1;

    // =========================================================================================================
    // Events (the dashboard reads the decision history from these)
    // =========================================================================================================

    event DeskOpened(
        uint256 indexed deskId,
        address indexed owner,
        address indexed agent,
        address asset,
        address quote,
        uint24 fee,
        uint128 maxPerTicket,
        uint128 periodCap,
        uint32 periodLength,
        uint32 minGap,
        uint32 maxTicketLife,
        uint64 expiry,
        bytes32 ruleHash
    );
    event RulesUpdated(
        uint256 indexed deskId, uint32 version, bytes32 ruleHash, uint128 maxPerTicket, uint128 periodCap, uint32 minGap
    );
    event DeskPaused(uint256 indexed deskId, address indexed by);
    event DeskUnpaused(uint256 indexed deskId);
    event DeskClosed(uint256 indexed deskId);
    event TicketProposed(
        uint256 indexed ticketId,
        uint256 indexed deskId,
        address indexed agent,
        address asset,
        uint128 amountIn,
        uint128 minOut,
        uint64 deadline,
        bytes32 ruleHash,
        bytes32 ref,
        bytes32 hash
    );
    event TicketApproved(uint256 indexed ticketId, uint256 indexed deskId, bytes32 hash, uint64 period, uint128 usedAfter);
    event TicketRejected(uint256 indexed ticketId, uint256 indexed deskId, uint16 reasonCode);
    event TicketCancelled(uint256 indexed ticketId, uint256 indexed deskId, address indexed by);
    event TicketExpired(uint256 indexed ticketId, uint256 indexed deskId);
    event TicketExecuted(
        uint256 indexed ticketId, uint256 indexed deskId, address indexed by, uint128 amountIn, uint128 amountOut
    );

    // =========================================================================================================
    // Errors
    // =========================================================================================================

    error BadDesk();
    error NotOwner();
    error NotAgent();
    error NotOwnerOrAgent();
    error UnknownTicket();
    error Refused(uint256 reasonBits);
    error HashMismatch(bytes32 expected, bytes32 actual);
    error WrongStatus(Status status);
    error NotExpiredYet();
    error Reentrancy();
    error TransferFailed();
    error ApproveFailed();
    error FeeOnTransferNotSupported(uint256 sent, uint256 received);
    error SwapShortfall(uint256 got, uint256 minOut);
    error LeftoverBalance(uint256 leftover);

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    modifier onlyOwner(uint256 deskId) {
        if (_desks[deskId].owner != msg.sender) revert NotOwner();
        _;
    }

    constructor(address router) {
        if (router.code.length == 0) revert BadDesk();
        ROUTER = router;
    }

    // =========================================================================================================
    // Owner: desks
    // =========================================================================================================

    /// @notice Open a desk for one agent, one asset and one quote token. The caller is the owner and the wallet funds come from.
    function openDesk(DeskInit calldata i) external returns (uint256 deskId) {
        if (
            i.agent == address(0) || i.asset == address(0) || i.quote == address(0) || i.asset == i.quote
                || i.agent == address(this) || i.asset.code.length == 0 || i.quote.code.length == 0
        ) revert BadDesk();
        _checkLimits(i.maxPerTicket, i.periodCap);
        if (i.periodLength < M.MIN_PERIOD || i.periodLength > M.MAX_PERIOD) revert BadDesk();
        if (i.maxTicketLife < M.MIN_TICKET_LIFE || i.maxTicketLife > M.MAX_TICKET_LIFE) revert BadDesk();
        if (i.minGap > i.periodLength) revert BadDesk();
        if (i.expiry <= block.timestamp || i.expiry > block.timestamp + M.MAX_DESK_LIFE) revert BadDesk();
        if (i.fee != 100 && i.fee != 500 && i.fee != 3000 && i.fee != 10000) revert BadDesk();
        if (i.ruleHash == bytes32(0)) revert BadDesk();

        deskId = ++deskCount;
        _desks[deskId] = Desk({
            owner: msg.sender,
            agent: i.agent,
            asset: i.asset,
            quote: i.quote,
            fee: i.fee,
            periodLength: i.periodLength,
            minGap: i.minGap,
            maxTicketLife: i.maxTicketLife,
            start: uint64(block.timestamp),
            expiry: i.expiry,
            lastApprovedAt: 0,
            maxPerTicket: i.maxPerTicket,
            periodCap: i.periodCap,
            ruleHash: i.ruleHash,
            version: 1,
            paused: false,
            closed: false
        });
        _byOwner[msg.sender].push(deskId);
        _byAgent[i.agent].push(deskId);
        emit DeskOpened(
            deskId,
            msg.sender,
            i.agent,
            i.asset,
            i.quote,
            i.fee,
            i.maxPerTicket,
            i.periodCap,
            i.periodLength,
            i.minGap,
            i.maxTicketLife,
            i.expiry,
            i.ruleHash
        );
    }

    /// @notice New rule version. Tickets proposed under the old rule hash can no longer be approved or executed.
    /// Lowering the period cap below what is already reserved this period only blocks new approvals.
    function updateRules(uint256 deskId, bytes32 ruleHash, uint128 maxPerTicket, uint128 periodCap, uint32 minGap)
        external
        onlyOwner(deskId)
    {
        Desk storage d = _desks[deskId];
        if (d.closed || ruleHash == bytes32(0)) revert BadDesk();
        _checkLimits(maxPerTicket, periodCap);
        if (minGap > d.periodLength) revert BadDesk();
        d.ruleHash = ruleHash;
        d.maxPerTicket = maxPerTicket;
        d.periodCap = periodCap;
        d.minGap = minGap;
        emit RulesUpdated(deskId, ++d.version, ruleHash, maxPerTicket, periodCap, minGap);
    }

    /// @notice Stop the desk from the next block: nothing can be proposed, approved or executed while paused.
    function pause(uint256 deskId) external onlyOwner(deskId) {
        _pause(deskId);
    }

    /// @notice The agent may stop itself (it can never unpause).
    function agentPause(uint256 deskId) external {
        if (_desks[deskId].agent != msg.sender) revert NotAgent();
        _pause(deskId);
    }

    function unpause(uint256 deskId) external onlyOwner(deskId) {
        Desk storage d = _desks[deskId];
        if (d.closed) revert BadDesk();
        if (d.paused) {
            d.paused = false;
            ++d.version;
            emit DeskUnpaused(deskId);
        }
    }

    /// @notice Close for good. Open and approved tickets can then only be cancelled or expire; none can execute.
    function close(uint256 deskId) external onlyOwner(deskId) {
        Desk storage d = _desks[deskId];
        if (!d.closed) {
            d.closed = true;
            ++d.version;
            emit DeskClosed(deskId);
        }
    }

    // =========================================================================================================
    // Agent: proposals
    // =========================================================================================================

    /// @notice Propose an order ticket. Reverts with Refused(bits) when the desk would not accept it; nothing is stored then.
    function propose(uint256 deskId, TicketInput calldata t) external returns (uint256 ticketId) {
        uint256 bits = _proposalBits(deskId, msg.sender, t);
        if (bits != 0) revert Refused(bits);
        ticketId = ++ticketCount;
        bytes32 h =
            M.ticketHash(address(this), ticketId, deskId, t.asset, t.amountIn, t.minOut, t.deadline, t.ruleHash, t.ref);
        _tickets[ticketId] = Ticket({
            deskId: uint64(deskId),
            deadline: t.deadline,
            proposedAt: uint64(block.timestamp),
            decidedAt: 0,
            period: 0,
            status: Status.Proposed,
            rejectCode: 0,
            asset: t.asset,
            amountIn: t.amountIn,
            minOut: t.minOut,
            amountOut: 0,
            ruleHash: t.ruleHash,
            ref: t.ref,
            hash: h
        });
        _ticketsOf[deskId].push(ticketId);
        emit TicketProposed(ticketId, deskId, msg.sender, t.asset, t.amountIn, t.minOut, t.deadline, t.ruleHash, t.ref, h);
    }

    // =========================================================================================================
    // Owner: manual decisions (the core of the desk)
    // =========================================================================================================

    /// @notice Approve one ticket. `expectedHash` is the hash shown on the review card: if the ticket differs, nothing happens.
    /// The amount is reserved against the current period's cap at this moment.
    function approve(uint256 ticketId, bytes32 expectedHash) external {
        Ticket storage t = _tickets[ticketId];
        if (t.status == Status.None) revert UnknownTicket();
        uint256 deskId = t.deskId;
        Desk storage d = _desks[deskId];
        if (d.owner != msg.sender) revert NotOwner();
        if (t.hash != expectedHash) revert HashMismatch(expectedHash, t.hash);
        uint256 bits = _decisionBits(ticketId);
        if (bits != 0) revert Refused(bits);

        uint64 p = M.periodOf(d.start, d.periodLength, block.timestamp);
        PeriodUse storage u = _use[deskId];
        uint128 used = M.usedIn(u.period, u.used, p) + t.amountIn; // <= periodCap, checked by _decisionBits
        u.period = p;
        u.used = used;
        d.lastApprovedAt = uint64(block.timestamp);
        t.status = Status.Approved;
        t.period = p;
        t.decidedAt = uint64(block.timestamp);
        emit TicketApproved(ticketId, deskId, t.hash, p, used);
    }

    /// @notice Reject one proposed ticket with a reason code of the owner's choice (0 = no reason given).
    function reject(uint256 ticketId, uint16 reasonCode) external {
        Ticket storage t = _tickets[ticketId];
        if (t.status == Status.None) revert UnknownTicket();
        if (_desks[t.deskId].owner != msg.sender) revert NotOwner();
        if (t.status != Status.Proposed) revert WrongStatus(t.status);
        t.status = Status.Rejected;
        t.rejectCode = reasonCode;
        t.decidedAt = uint64(block.timestamp);
        emit TicketRejected(ticketId, t.deskId, reasonCode);
    }

    /// @notice Owner or agent withdraws a ticket that has not been executed. An approved ticket releases its reservation.
    function cancel(uint256 ticketId) external {
        Ticket storage t = _tickets[ticketId];
        if (t.status == Status.None) revert UnknownTicket();
        Desk storage d = _desks[t.deskId];
        if (msg.sender != d.owner && msg.sender != d.agent) revert NotOwnerOrAgent();
        if (t.status != Status.Proposed && t.status != Status.Approved) revert WrongStatus(t.status);
        _release(t);
        t.status = Status.Cancelled;
        t.decidedAt = uint64(block.timestamp);
        emit TicketCancelled(ticketId, t.deskId, msg.sender);
    }

    /// @notice Anyone may mark a ticket past its deadline as expired; an approved one releases its reservation.
    function expire(uint256 ticketId) external {
        Ticket storage t = _tickets[ticketId];
        if (t.status == Status.None) revert UnknownTicket();
        if (t.status != Status.Proposed && t.status != Status.Approved) revert WrongStatus(t.status);
        if (block.timestamp <= t.deadline) revert NotExpiredYet();
        _release(t);
        t.status = Status.Expired;
        t.decidedAt = uint64(block.timestamp);
        emit TicketExpired(ticketId, t.deskId);
    }

    // =========================================================================================================
    // Execution of an approved ticket (owner or agent)
    // =========================================================================================================

    /// @notice Buy the asset for an approved ticket: quote token from the owner's wallet, output straight to the owner.
    function execute(uint256 ticketId) external nonReentrant returns (uint256 amountOut) {
        Ticket storage t = _tickets[ticketId];
        if (t.status == Status.None) revert UnknownTicket();
        Desk storage d = _desks[t.deskId];
        if (msg.sender != d.owner && msg.sender != d.agent) revert NotOwnerOrAgent();
        uint256 bits = _executeBits(ticketId);
        if (bits != 0) revert Refused(bits);

        // Effects before interactions: the ticket is final before any token moves.
        t.status = Status.Executed;
        amountOut = _swap(d.owner, d.quote, d.asset, d.fee, t.amountIn, t.minOut);
        t.amountOut = uint128(amountOut);
        emit TicketExecuted(ticketId, t.deskId, msg.sender, t.amountIn, uint128(amountOut));
    }

    // =========================================================================================================
    // Views: checks before signing
    // =========================================================================================================

    /// @notice Reason bits a proposal from `proposer` would fail on right now (0 = the desk would accept it).
    function checkTicket(uint256 deskId, address proposer, TicketInput calldata t) external view returns (uint256) {
        return _proposalBits(deskId, proposer, t);
    }

    /// @notice Reason bits the owner's approval of this ticket would fail on right now (0 = approve would succeed).
    function checkDecision(uint256 ticketId) external view returns (uint256) {
        if (_tickets[ticketId].status == Status.None) return M.R_UNKNOWN_TICKET;
        return _decisionBits(ticketId);
    }

    /// @notice Reason bits execute() would fail on right now, including the owner's allowance and balance of the quote token.
    function checkExecute(uint256 ticketId) external view returns (uint256) {
        if (_tickets[ticketId].status == Status.None) return M.R_UNKNOWN_TICKET;
        return _executeBits(ticketId);
    }

    function getDesk(uint256 deskId) external view returns (Desk memory) {
        return _desks[deskId];
    }

    function getTicket(uint256 ticketId) external view returns (Ticket memory) {
        return _tickets[ticketId];
    }

    function desksOfOwner(address owner_) external view returns (uint256[] memory) {
        return _byOwner[owner_];
    }

    function desksOfAgent(address agent) external view returns (uint256[] memory) {
        return _byAgent[agent];
    }

    function ticketCountOf(uint256 deskId) external view returns (uint256) {
        return _ticketsOf[deskId].length;
    }

    /// @notice Ticket ids of a desk, newest last, `limit` at most from `offset`.
    function ticketsOf(uint256 deskId, uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
        uint256[] storage all = _ticketsOf[deskId];
        if (offset >= all.length) return new uint256[](0);
        uint256 n = all.length - offset;
        if (n > limit) n = limit;
        ids = new uint256[](n);
        for (uint256 k; k < n; ++k) {
            ids[k] = all[offset + k];
        }
    }

    /// @notice The current period, what is reserved in it and what is left under the period cap.
    function periodUse(uint256 deskId) external view returns (uint64 period, uint128 used, uint128 left) {
        Desk storage d = _desks[deskId];
        period = M.periodOf(d.start, d.periodLength, block.timestamp);
        PeriodUse memory u = _use[deskId];
        used = M.usedIn(u.period, u.used, period);
        left = used >= d.periodCap ? 0 : d.periodCap - used;
    }

    // =========================================================================================================
    // Internal: checks
    // =========================================================================================================

    function _usedNow(uint256 deskId, Desk storage d) internal view returns (uint128) {
        PeriodUse memory u = _use[deskId];
        return M.usedIn(u.period, u.used, M.periodOf(d.start, d.periodLength, block.timestamp));
    }

    function _proposalBits(uint256 deskId, address proposer, TicketInput calldata t) internal view returns (uint256 bits) {
        Desk storage d = _desks[deskId];
        bits = M.deskBits(d.owner != address(0), d.closed, d.paused, d.expiry, block.timestamp);
        if (bits & M.R_UNKNOWN_DESK != 0) return bits;
        if (proposer != d.agent) bits |= M.R_NOT_AGENT;
        if (t.asset != d.asset) bits |= M.R_WRONG_ASSET;
        bits |= M.amountBits(t.amountIn, d.maxPerTicket, d.periodCap, _usedNow(deskId, d));
        bits |= M.gapBits(d.lastApprovedAt, d.minGap, block.timestamp);
        bits |= M.deadlineBits(t.deadline, d.maxTicketLife, block.timestamp);
        if (t.ruleHash != d.ruleHash) bits |= M.R_RULES_CHANGED;
        if (t.minOut == 0) bits |= M.R_NO_MIN_OUT;
    }

    /// @notice The same rules as a proposal, re-read at decision time (rules, caps, period and pause may have changed).
    function _ticketBits(uint256 ticketId) internal view returns (uint256 bits, Desk storage d) {
        Ticket storage t = _tickets[ticketId];
        d = _desks[t.deskId];
        bits = M.deskBits(d.owner != address(0), d.closed, d.paused, d.expiry, block.timestamp);
        if (t.deadline < block.timestamp) bits |= M.R_DEADLINE_PASSED;
        if (t.ruleHash != d.ruleHash) bits |= M.R_RULES_CHANGED;
        if (t.asset != d.asset) bits |= M.R_WRONG_ASSET;
    }

    function _decisionBits(uint256 ticketId) internal view returns (uint256 bits) {
        Ticket storage t = _tickets[ticketId];
        Desk storage d;
        (bits, d) = _ticketBits(ticketId);
        if (t.status != Status.Proposed) bits |= M.R_NOT_PENDING;
        if (t.amountIn > d.maxPerTicket) bits |= M.R_OVER_TICKET_CAP;
        bits |= M.amountBits(t.amountIn, d.maxPerTicket, d.periodCap, _usedNow(t.deskId, d)) & M.R_OVER_PERIOD_CAP;
        bits |= M.gapBits(d.lastApprovedAt, d.minGap, block.timestamp);
    }

    function _executeBits(uint256 ticketId) internal view returns (uint256 bits) {
        Ticket storage t = _tickets[ticketId];
        Desk storage d;
        (bits, d) = _ticketBits(ticketId);
        if (t.status != Status.Approved) bits |= M.R_NOT_APPROVED;
        if (t.minOut == 0) bits |= M.R_NO_MIN_OUT;
        (bool okA, uint256 allowance_) = _tryRead(d.quote, abi.encodeCall(IOddroERC20.allowance, (d.owner, address(this))));
        (bool okB, uint256 balance_) = _tryRead(d.quote, abi.encodeCall(IOddroERC20.balanceOf, (d.owner)));
        if (!okA || !okB) return bits | M.R_TOKEN_UNREADABLE;
        if (allowance_ < t.amountIn) bits |= M.R_LOW_ALLOWANCE;
        if (balance_ < t.amountIn) bits |= M.R_LOW_BALANCE;
    }

    // =========================================================================================================
    // Internal: effects and interactions
    // =========================================================================================================

    function _checkLimits(uint128 maxPerTicket, uint128 periodCap) internal pure {
        if (maxPerTicket == 0 || periodCap == 0 || maxPerTicket > periodCap) revert BadDesk();
    }

    function _pause(uint256 deskId) internal {
        Desk storage d = _desks[deskId];
        if (d.closed) revert BadDesk();
        if (!d.paused) {
            d.paused = true;
            ++d.version;
            emit DeskPaused(deskId, msg.sender);
        }
    }

    /// @notice Gives an approved ticket's amount back to its period, if that period is still the stored one.
    function _release(Ticket storage t) internal {
        if (t.status != Status.Approved) return;
        PeriodUse storage u = _use[t.deskId];
        if (u.period == t.period) u.used -= t.amountIn;
    }

    function _swap(address owner_, address quote, address asset, uint24 fee, uint256 amountIn, uint256 minOut)
        internal
        returns (uint256 amountOut)
    {
        uint256 inBefore = _balanceOf(quote, address(this));
        _safeTransferFrom(quote, owner_, address(this), amountIn);
        uint256 got = _balanceOf(quote, address(this)) - inBefore;
        if (got != amountIn) revert FeeOnTransferNotSupported(amountIn, got);

        _forceApprove(quote, ROUTER, amountIn);
        uint256 outBefore = _balanceOf(asset, owner_);
        IOddroSwapRouter02(ROUTER).exactInputSingle(
            IOddroSwapRouter02.ExactInputSingleParams({
                tokenIn: quote,
                tokenOut: asset,
                fee: fee,
                recipient: owner_,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        // What the owner actually received, not what the router says.
        amountOut = _balanceOf(asset, owner_) - outBefore;
        if (amountOut < minOut) revert SwapShortfall(amountOut, minOut);

        _forceApprove(quote, ROUTER, 0);
        uint256 inAfter = _balanceOf(quote, address(this));
        if (inAfter > inBefore) revert LeftoverBalance(inAfter - inBefore);
    }

    function _balanceOf(address token, address who) internal view returns (uint256) {
        (bool ok, uint256 v) = _tryRead(token, abi.encodeCall(IOddroERC20.balanceOf, (who)));
        if (!ok) revert TransferFailed();
        return v;
    }

    function _tryRead(address token, bytes memory data) internal view returns (bool ok, uint256 value) {
        bytes memory ret;
        (ok, ret) = token.staticcall(data);
        if (!ok || ret.length < 32) return (false, 0);
        value = abi.decode(ret, (uint256));
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!ok || (ret.length != 0 && (ret.length < 32 || !abi.decode(ret, (bool))))) revert TransferFailed();
    }

    function _forceApprove(address token, address spender, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0x095ea7b3, spender, amount));
        if (!ok || (ret.length != 0 && (ret.length < 32 || !abi.decode(ret, (bool))))) revert ApproveFailed();
    }
}
