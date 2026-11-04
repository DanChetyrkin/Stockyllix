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

Prepare a five-minute demonstration: sign in → portfolio → pending order → admin advance → executed order → ranking → daily review. Then answer: what would fail first at1,000players, what evidence supports that answer, and what would you measure before changing architecture?

Real-date review tracking tests instrumentation. It does not prove improved retention. Simulated stock prices with real ECB FX are a disclosed product decision, not live-market support.

## 7. Personal features without changing competition rules

Trace a resized photo through authenticated API validation to the private profile document. Explain why the display name is not a unique login ID and why the Admin SDK still needs server authorization.

Explain the time boundaries: shared game time drives trading and the quiz's Israel calendar day; real Israel dates measure review return visits; real Israel hours plus a saved manual preference control appearance. Crossing game midnight changes the question, while it does not count as a real return visit or change appearance. Each player has one current saved quiz answer; the next game day replaces it, and duplicate submissions keep the first answer.

Trace Advance clock → returned job ID → automatic bounded steps → published state. Explain why Resume continues persisted work after a reload and why React clock polling must not invalidate every in-flight data request. Find How to play and the compact source/status details; internal identifiers belong in diagnostics rather than ordinary labels.

Distinguish the live BOI representative reference panel, the staged BOI historical file and the active ECB execution dataset. Explain why a Twelve Data importer without an API key, tested coverage and display/storage permission is not a working stock integration. Explain why import activation needs a new world rather than replacing prices under existing positions.

Work through weighted average cost: buy 10 units for 3,000 ILS, buy 10 for 4,000, then sell 5 for 2,000. The sold cost is 1,750, realized profit is 250, and remaining cost is 5,250. Explain why a USD position's ILS result includes FX and why SPY must use the same period/currency. A month's return is not an annual return.

Explain why a price target is a preference rather than an order, and why charts and API responses must never include future world prices.
