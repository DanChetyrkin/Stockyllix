# Trading and clock reference

Current instructions are in the [runbook](runbook.md), [reviewer walkthrough](reviewer-demo.md) and [release checklist](finish-release.md). The [verification record](verification.md) separates deployed evidence from pending checks.

## Why the reported AMZN million did not fall

A read-only November 4, 2026 audit found the reported ₪50,000 AMZN buy **pending** at the next US opening. Cash was ₪1,000,000 total, ₪50,000 reserved and ₪950,000 available; holdings were zero and total value remained ₪1,000,000. The shared historical world was idle before that opening with the former manual clock. No trade was submitted for the friend and no compensating money was added.

The phone table hid status/execution time, and the old cash label obscured reservations. Mobile rows now show status and time vertically. Portfolio distinguishes available cash, reserved cash, total cash, holdings and total value. At execution cash exchanges for holdings; buying is not itself a loss in total value.

## Persistent clock semantics

- `clock.targetNow` is logical game time; `world.now` is the last fully processed event position. Both retain real source dates. The quiz follows logical time even at a midnight without a price event.
- A Firestore anchor advances one game second per server second while running. Device time only interpolates the display and never selects execution.
- Authenticated requests resume bounded work after Render sleep/restart. With no incoming request, the free service does not promise an always-on worker. Trading waits for reached events to finish.
- Administrator changes are audited. Forward jumps traverse every price/FX/week event. Leases, fencing and per-player event markers protect retries.
- `X-Stockyllix-Test: true` selects the authenticated administrator's separate test realm. Its clock, portfolios, orders and pointer cannot affect the shared league.
- Backward time requires another game. Real-time execution remains blocked until suitable current prices and FX exist; history and completed fills are never relabelled.

The [archived 1.3.0 incident/release](archive/trading-clock-v1.3.md) preserves prior evidence. Its former control labels and deployment instructions are historical, not current setup instructions.
