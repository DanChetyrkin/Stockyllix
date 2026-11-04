# Game rules and decisions

The assignment is authoritative. The following decisions fill gaps; they are not claims about real brokerage behaviour.

| Topic | Assignment | Decision | Reason and test |
| --- | --- | --- | --- |
| Starting money | ₪1,000,000 cash | Once per authenticated UID per world, in a transaction | Concurrent initialization cannot mint extra money |
| Order amount | Buy/sell by ILS, fractions allowed | Positive decimal string, at most two decimal places, converted to integer agorot | Reject zero, negatives, excessive precision and unsafe integer amounts |
| Value | Needed for concentration and MDD | All cash, including reserved cash, plus every holding at latest available price and FX | Reservations alone do not change equity |
| Concentration at submission | A security cannot exceed 20% at purchase | Existing marked holding + all pending buys + new amount <=20% equity | Concurrent requests share one portfolio transaction; pending sales do not create headroom |
| Concentration at execution | At purchase | FIFO, actual holding after this fill <=20% current equity | Older orders get priority; later orders can be rejected after market changes |
| Passive concentration | Not specified | No forced sale after appreciation | Further buys still checked |
| Pending buys | No leverage | Reserve the full ILS amount | Available cash is cash minus reserved cash |
| Pending sells | No shorts | One pending sell per instrument; reserve all currently available units | New purchases do not enlarge the existing reservation |
| Sale after price decline | Not specified | Compute units at execution; reject the entire order if reserved units are insufficient | No negative holdings or silent change to requested amount |
| Partial fills | Not specified | No partial fills | Terminal result is executed or rejected with a reason |
| Cancellation | Forbidden | No cancellation endpoint | Rule rejection is a server result, not user cancellation |
| Execution order | Not specified | Monotonic sequence per portfolio, FIFO within each event | No shared liquidity; users do not affect each other's fill prices |
| Duplicate requests | Not specified | Idempotency key scoped to user/world; conflicting payload rejected | Retry does not reserve or execute twice |
| Atomicity | Not specified | Order outcomes, portfolio and event marker commit together | Crash/retry cannot publish partial account state |
| Precision | Not specified | Decimal arithmetic at fixed precision, integer cash, up to18 decimal quantity places | Buy quantity rounds down; sell quantity rounds up; display rounding never decides validity |
| Comparison precision | Not specified | Concentration compares NAV/exposure at12fractionalILS digits; percentile metrics at12fractionalpercentage digits | Avoids sub-cent quantity dust turning equal portfolios into winners/losers; settlement retains40significantdigits |
| Sale maximum | Not specified | API supplies unreserved holding value rounded down to whole agorot | The visible rounded holding value can be slightly higher; residual sub-cent units are retained |
| Pending count | Not specified | Maximum20 pending orders per player | Bounds transaction size and abuse |
| Trading interval | Specified hours | Open-inclusive, close-exclusive | Exactly at close goes to next open |
| Sessions | TA Mon–Thu10:00–17:30, Fri10:00–13:50; US09:30–16:00 NY | IANA timezone conversion; assignment hours govern | Tests cover both DST transitions and Friday |
| Holidays | Not specified | Explicit dataset sessions; simulated world uses weekdays, not a full real holiday calendar | Missing quote is not automatically a holiday; historical imports must supply holiday sessions |
| Clock advancement | Shared and controllable | Admin-only, forward-only, within dataset; one durable job | Account operations blocked while advancing; lease and fencing prevent stale workers |
| Multi-event jumps | Not specified | Process every crossed event chronologically | Same result as processing the same events individually |
| Competition week | Monday–Friday | Monday00:00 through Saturday00:00 Israel | Includes FridayUS close; week-end values freeze |
| Weekly transition | Not specified | Keep assets and cash; reset baseline/peak/MDD | No weekly cash grant |
| Midweek signup | Not specified | Ranked if joined Monday before TA opens; otherwise provisional until next week | Avoids comparing unequal observation windows |
| Weekly return | Return percentile | End value/start value -1 | No external deposits or withdrawals |
| Drawdown | Peak to subsequent trough | Sample at world price/FX events; carry max fall from prior peak | Not an intraday-high/low reconstruction |
| Percentile | Best gets100 | rank=1+number strictly better;100×(N-rank)/(N-1) | Singleton100; ties equal; tied bottom is not necessarily0 |
| Overall score | 85% return +15% stability | Exact required weights | Final score ties share rank; UID only stabilizes display order |
| No trading | Not specified | Cash participates, return0 and MDD0 | Holding cash is allowed; stability can reward it |
| Missing price | Not specified | Halt processing; preserve resumable job | No zero price, future fallback or business rejection for an infrastructure error |
| Missing FX day | Execution-time exchange rate | Latest observation available before execution, with source date | No same-day historical lookahead; baseline required |
| End of data | Not specified | Reject orders without a remaining fill event and block advancement beyond end | No looping or invented quotes |
| Fees/dividends/splits | Not specified | Not simulated; historical imports must avoid unhandled splits | Explicit educational simplification |
| Future information | Not specified | Private future snapshots and seed; API returns only current/public metadata | External historical lookup remains a replay limitation |
| Reset | Not specified | Admin confirmation, idle world only, fresh world ID | Old data retained; stale-world submissions rejected |
| Daily quiz | Additional educational feature | Shared question per game day in Israel time; one current saved answer per player/world | First answer wins retries; next game day replaces it; no cash/score effect |
| Return-visit measurement | Daily feature needs success measure | Count real-date review visits separately in the backend | Advancing simulated days is not measured real retention |

Example: values1,000,000 →1,100,000 →990,000 →1,050,000 imply MDD10% and final return5%.

Product caveats: stability rewards cash; historical replay can be researched outside the application; a trusted demo administrator chooses when time advances. A real production competition would need a separately reviewed clock/anti-abuse policy. These observations do not alter the assignment's score.
