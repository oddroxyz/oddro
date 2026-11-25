// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title OddroTicketMath
/// @notice Pure helpers for OddroOrderDesk: the reason bits a ticket can fail on, period arithmetic and the ticket hash.
/// The site mirrors every bit in src/lib/desk/bits.ts; a parity test reads this file and fails on any drift.
library OddroTicketMath {
    // ------------------------------------------------------------------ reason bits (a ticket is clean when the mask is 0)
    uint256 internal constant R_UNKNOWN_DESK = 1 << 0;
    uint256 internal constant R_DESK_PAUSED = 1 << 1;
    uint256 internal constant R_DESK_CLOSED = 1 << 2;
    uint256 internal constant R_DESK_EXPIRED = 1 << 3;
    uint256 internal constant R_NOT_AGENT = 1 << 4;
    uint256 internal constant R_WRONG_ASSET = 1 << 5;
    uint256 internal constant R_ZERO_AMOUNT = 1 << 6;
    uint256 internal constant R_OVER_TICKET_CAP = 1 << 7;
    uint256 internal constant R_OVER_PERIOD_CAP = 1 << 8;
    uint256 internal constant R_TOO_SOON = 1 << 9;
    uint256 internal constant R_DEADLINE_PASSED = 1 << 10;
    uint256 internal constant R_DEADLINE_TOO_FAR = 1 << 11;
    uint256 internal constant R_RULES_CHANGED = 1 << 12;
    uint256 internal constant R_NO_MIN_OUT = 1 << 13;
    uint256 internal constant R_NOT_PENDING = 1 << 14;
    uint256 internal constant R_NOT_APPROVED = 1 << 15;
    uint256 internal constant R_LOW_ALLOWANCE = 1 << 16;
    uint256 internal constant R_LOW_BALANCE = 1 << 17;
    uint256 internal constant R_UNKNOWN_TICKET = 1 << 18;
    uint256 internal constant R_TOKEN_UNREADABLE = 1 << 19;

    /// @notice Bits that only matter when the ticket is executed (funds are read then, not at proposal or approval).
    uint256 internal constant FUNDS_BITS = R_LOW_ALLOWANCE | R_LOW_BALANCE | R_TOKEN_UNREADABLE;

    // ------------------------------------------------------------------ bounds
    uint32 internal constant MIN_PERIOD = 1 hours;
    uint32 internal constant MAX_PERIOD = 366 days;
    uint32 internal constant MIN_TICKET_LIFE = 5 minutes;
    uint32 internal constant MAX_TICKET_LIFE = 30 days;
    uint64 internal constant MAX_DESK_LIFE = 730 days;

    /// @notice Index of the period that contains `t`. Periods are fixed windows of `len` seconds counted from `start`.
    /// A time before `start` belongs to period 0 (a desk cannot be used before it is opened anyway).
    function periodOf(uint64 start, uint32 len, uint256 t) internal pure returns (uint64) {
        if (t <= start || len == 0) return 0;
        return uint64((t - start) / len);
    }

    /// @notice Amount already reserved in the period `nowPeriod`, given the stored (period, used) pair.
    function usedIn(uint64 storedPeriod, uint128 storedUsed, uint64 nowPeriod) internal pure returns (uint128) {
        return storedPeriod == nowPeriod ? storedUsed : 0;
    }

    /// @notice Desk state bits: unknown, closed, paused, expired.
    function deskBits(bool exists, bool closed, bool paused, uint64 expiry, uint256 nowTs)
        internal
        pure
        returns (uint256 bits)
    {
        if (!exists) return R_UNKNOWN_DESK;
        if (closed) bits |= R_DESK_CLOSED;
        if (paused) bits |= R_DESK_PAUSED;
        if (nowTs > expiry) bits |= R_DESK_EXPIRED;
    }

    /// @notice Amount bits for one ticket: zero, over the per-ticket cap, over what is left of the period cap.
    function amountBits(uint256 amount, uint128 ticketCap, uint128 periodCap, uint128 used)
        internal
        pure
        returns (uint256 bits)
    {
        if (amount == 0) return R_ZERO_AMOUNT;
        if (amount > ticketCap) bits |= R_OVER_TICKET_CAP;
        // used <= periodCap always holds (approvals never push it over), so the subtraction cannot underflow.
        if (used > periodCap || amount > uint256(periodCap) - used) bits |= R_OVER_PERIOD_CAP;
    }

    /// @notice Spacing between approved tickets: the next approval may come `minGap` seconds after the last one.
    function gapBits(uint64 lastApprovedAt, uint32 minGap, uint256 nowTs) internal pure returns (uint256) {
        if (lastApprovedAt == 0 || minGap == 0) return 0;
        return nowTs < uint256(lastApprovedAt) + minGap ? R_TOO_SOON : 0;
    }

    /// @notice Deadline bits: already passed, or further away than the desk allows a ticket to live.
    function deadlineBits(uint64 deadline, uint32 maxLife, uint256 nowTs) internal pure returns (uint256 bits) {
        if (deadline < nowTs) bits |= R_DEADLINE_PASSED;
        else if (deadline - nowTs > maxLife) bits |= R_DEADLINE_TOO_FAR;
    }

    /// @notice The hash the owner signs off on. It binds every field the review card shows, the chain and this desk contract.
    function ticketHash(
        address desk,
        uint256 ticketId,
        uint256 deskId,
        address asset,
        uint256 amountIn,
        uint256 minOut,
        uint64 deadline,
        bytes32 ruleHash,
        bytes32 ref
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(block.chainid, desk, ticketId, deskId, asset, amountIn, minOut, deadline, ruleHash, ref)
        );
    }
}
