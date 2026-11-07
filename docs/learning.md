# Learn and explain Stockyllix

Do not memorize files. Trace one real action and explain every decision on its path. Short lowercase comments identify non-obvious intent; names and small functions should explain ordinary code.

## 1. Client and TypeScript

Read one route, the shared UI components, AuthContext and the API client. Explain props, local state, effects, loading/error states, interfaces, unions and nullable values. Why does a TypeScript type not validate JSON received over HTTP? Why is the API URL public while an Admin key is not?

Exercise: change a DTO field deliberately, run typecheck, explain the error, and undo the exercise. Do not disable strict mode or add `any` to bypass it.

## 2. Authentication and persistence

Trace registration → Firebase user → ID token → Express verification → UID → idempotent player initialization. Explain why a navigation redirect is UX rather than authorization, and why an Auth account can exist temporarily without a portfolio.

Exercise: retry initialization and verify cash remains1,000,000. Reload the browser and explain how the session is restored. Compare web and native persistence initialization.

## 3. Trade rules and decimals

Read pure valuation/trading functions before the database service. Work through a100,000ILS US buy using the execution price and FX. Explain cash versus available cash, reserved holdings, the20% rule at submission/execution, FIFO, and the possibility of a rejected sale after a price drop.

Exercise: start at1,000,000ILS and send two150,000ILS buys for the same instrument concurrently. Explain why both individually look affordable but only one can pass the aggregate concentration rule.

## 4. Transactions and retries

Trace API validation → GameService → DocumentStore transaction → Firestore. Explain atomicity, idempotency, transaction retries and why transaction callbacks have no external side effects. Compare the serialized in-memory test adapter with actual Firestore contention.

Exercise: retry one idempotency key and compare order ID, reserved cash and quantity. Reuse it with a different amount and explain the conflict.

## 5. Clock and weekly score

Read session generation, UTC conversion, event selection, clock jobs and per-player event processing. Explain a lease, a fencing token, a durable cursor and an atomic processed-event marker. Why is the last processed marker needed if a cursor already exists?

Manually compute MDD for1m →1.1m →990k →1.05m. Explain the percentile convention, ties, provisional late joiners, cash players and the85/15score. Explain why daily high/low does not tell us which came first.

## 6. Operations and interview rehearsal

Run a local failure/restart demonstration. Find a request by ID, interpret a rejected order and resume a clock job. Explain Render sleep, ephemeral disk, Spark quotas, why Cloud Functions was omitted, and which checks were performed locally versus in the cloud.

Use the [3–5 minute walkthrough](../README.md#try-it-in-35-minutes): sign in → separate test game → pending order → advance to its execution → executed order → portfolio/ranking → daily question above news. Then answer: what would fail first at 1,000 players, what evidence supports that answer, and what would you measure before changing architecture?

Real-date return tracking tests instrumentation, not improved retention. The shared game replays real Yahoo/BOI history. Preserved legacy simulation and a newly selected dated test simulation are separate, disclosed sources; the test simulation generates its own FX and never claims to be real market data.

## 7. Personal features without changing competition rules

Trace a resized photo through authenticated API validation to the private profile document. Explain why the display name is not a unique login ID and why the Admin SDK still needs server authorization.

Explain the time boundaries: shared game time drives trading and the quiz's Israel calendar day; real Israel dates measure review return visits; real Israel hours plus a saved manual preference control appearance. Crossing game midnight changes the question, while it does not count as a real return visit or change appearance. Each player has one current saved quiz answer; the next game day replaces it, and duplicate submissions keep the first answer.

Trace Advance to market event → server-selected event → durable job → bounded steps → published state. Explain why a server receipt can confirm a clock change after a reload, why an unknown outcome keeps its original request key, and why clock polling must not invalidate every in-flight data request. Explain why every pending order can be reached through market events. Find advanced recovery and its diagnostics.

Distinguish the latest published BOI reference panel, the real historical replay's BOI execution rates and the preserved legacy world's ECB rates. Explain why the live Yahoo quote and Alpha Vantage news adapters were removed instead of kept as dead code, why new data needs a new world instead of replacing prices under existing positions, and why TradingView display is not a game-data API.

Create a dated 28-day simulated test game, for example March 2027, only in the administrator's test realm. Explain why its private versioned descriptor must be persisted with the world, why its registry is separate from shared history and how restart recreates exactly the same data. Explain the differing Israel/New York DST transition dates without shifting historical observations. Use normal Israel date/time input; explain why a nonexistent or ambiguous minute is rejected instead of silently selecting an offset.

Work through weighted average cost: buy 10 units for 3,000 ILS, buy 10 for 4,000, then sell 5 for 2,000. The sold cost is 1,750, realized profit is 250, and remaining cost is 5,250. Explain why a USD position's ILS result includes FX and why SPY must use the same period/currency. A month's return is not an annual return.

Explain why charts and API responses must never include future world prices.
