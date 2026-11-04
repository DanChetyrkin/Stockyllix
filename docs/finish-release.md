# Release handoff — November 4, 2026

This is a noncommercial educational interview demonstration with virtual money. Source terms and technical availability are separate. No payment card, paid plan, new service or data deletion is required for the historical replay.

## Deploy the prepared server and private real history

1. In the existing Render **stockyllix-api** service, keep **Free**, repository **DanChetyrkin/Stockyllix**, branch **codex/render-free-deploy**, and root directory **server**.
2. Open **Environment → Secret Files → Add Secret File**. Use filename **yahoo-world.json**. Paste the contents of local **server/data/yahoo-world.json**, not a service-account key. Do not put this file in Git or a public URL: it contains unrevealed future game prices.
3. Add **HISTORICAL_DATASET_PATH=/etc/secrets/yahoo-world.json**. Keep the original **DATASET_SEED**, **DATASET_PATH** if set, **FX_DATA_PATH**, Firebase credential, administrator UIDs and CORS origins unchanged. Do not set **HISTORICAL_DATA_USE_CONFIRMED**: selecting a file does not assert supplier approval.
4. Keep **YAHOO_AUTOMATED_ACCESS_AUTHORIZED=false** (also the default), **CURRENT_MARKET_ACCESS=admin** and **NEWS_ACCESS=admin**. No new Yahoo collection is authorized. The existing Alpha Vantage free key did not obtain News articles, so copying it to Render is not a fix.
5. Save and choose **Manual Deploy → Deploy latest commit** after the prepared commit is pushed. Auto-deploy is off. Verify [health](https://stockyllix-api.onrender.com/health): **version 1.2.0**, **release historical-news-v2**, and **commit** equal to the deployed GitHub SHA.
6. Tell the agent that the release is live. The agent can then perform the requested cloud acceptance in a separate real-data world. Do not reset the old world merely to test deployment.

Render makes secret files available at `/etc/secrets/<filename>`. The candidate is about 42KB, below the combined 1MB limit. See [official secret-file instructions](https://render.com/docs/configure-environment-variables#secret-files). The file survives process restarts as deployment configuration; no runtime-local disk is used for balances, jobs or caches.

Browser automation could read Chrome's accessibility tree but could not target its window reliably (coordinate geometry unavailable; capture showed a different app). No alternative session/cookie extraction was attempted. The account-bound Render upload and deployment remain an operator step.

## What the historical world contains

Dataset **historical-8c9e717c12d59090** covers **October 19, 2026 00:00 Israel time → November 2, 2026 23:00 Israel time**, with October 16 closing baselines, two complete competition weeks and a final partial-week execution buffer.

- Twenty real Yahoo OHLC series, normalized from ILA to ILS for TASE; US prices remain USD.
- Real Bank of Israel daily representative USD/ILS. Each historical rate becomes available conservatively at the following Israel midnight; unavailable future rates are never used.
- Officially checked TASE October 27 closure; no reported splits/dividends within the chosen scoring window. There is no synthetic gap-filling.
- Opening/closing prices use the assignment's session hours. The game does not claim intraday path fidelity or true intraday MDD.
- Buys, sells, reservations, valuation, P/L, weekly return, MDD and ranking all resolve the active world's immutable dataset.
- The clock stops at the end. A new world preserves old world, portfolio, order and ranking documents. Old holdings never migrate to another price series. Generated datasets remain only for reading the legacy world; installed real-history choices exclude new generated-price worlds.

The expanded local acceptance uses the actual private file and an isolated MemoryStore: twenty opening buys, twenty closing sells, fractional units/cash/P&L, twenty-one ranking participants, two weekly archives, source-bar comparison, no future history, recreation and end refusal. This is **not** a deployed trading test. See [verification](verification.md) for later HTTP/emulator and browser outcomes.

## Current prices: actual blocker and precise diagnostic

Earlier local HTTP returned twenty real quotes and retained the Firestore cache after API restart. Render's actual requests returned Yahoo HTTP429, twice, with zero available prices. This was not a working cloud feed.

[Yahoo terms, Section 2, conduct item 9](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html) explicitly require prior permission for automated access/collection. No such grant was obtained. New collection is therefore disabled before any fetch; **YAHOO_AUTOMATED_ACCESS_AUTHORIZED** must not be set merely because a local test or user approval succeeds. This is separate from the unverified reuse/display rights of the snapshot already acquired. We do not claim the commercial-use paragraph expressly bans this noncommercial interview display, and do not claim a licence was granted.

The administrator-only **POST /api/admin/feeds/current-market/check** accepts only `{}` and fixes the sample to **AAPL, MSFT, LUMI.TA, POLI.TA**. It shares the normal feed's Firestore cache, lease and cooldown. Without supplier permission it returns **SOURCE_PERMISSION_REQUIRED**, **attemptedSymbols: []**, and **allFourRefreshed: false**; this is an honest blocked result, not a successful four-stock test. With actual supplier permission it attempts at most four sequential source calls and stops immediately on throttling/access denial. It cannot force a refresh, accept arbitrary URLs/symbols or bypass a prior backoff. Only after all four actually refresh from Render should coverage expand to twenty.

No additional free account was identified that verifiably supplies these twenty listings with both cloud access and the required display/cache rights. Do not create an account or buy a plan based on an unsupported promise. Existing [TradingView market widgets](https://www.tradingview.com/widget/) provide the separate public source-owned display; widget rendering is not proof that our API receives prices.

## Public UI and news

- [Game](https://stockyllix.web.app): production Firebase Auth → Render API → Firestore; the release export is checked for the real API URL and absence of emulator settings/server secrets.
- [News & quiz](https://stockyllix.web.app/news): TradingView's new compact News Feed with official asset-class/symbol filters, theme support and source links. News time is real publication time; quiz time follows the shared game day. The old `/daily-review` redirects here. Portfolio metrics/insight remain on the home page.
- [Current market](https://stockyllix.web.app/current-market): source-owned TradingView display, potentially delayed. ILA is explicitly agorot, not ILS. No current quote executes a historical order.
- The mobile header and clock scroll away with page content. Desktop retains the existing layout.

External panels remain sandboxed without access to account storage. Only the app-owned wrapper's outer height is measured. Provider content/shadow roots are not scraped, restyled or exported; attribution stays visible.

## Final acceptance still required in the deployed real world

1. Sign in, create the separate historical world, initialize one million once and verify twenty prices/source/date.
2. Buy before opening and while open; retry an identical request; verify opening/closing execution, USD FX, holdings/cash and the 20% rejection.
3. Sell, advance multiple events, observe changing valuation and complete a weekly ranking; confirm no future history is exposed.
4. Reload while processing, resume without duplicate fills, reach end-of-data and refuse further orders/time.
5. Restart the Render service; confirm the same world, completed fills and saved caches remain. Create a fresh real world afterwards for the reviewer, keeping the acceptance world's records.
6. Check the public site on a physical phone and Expo Go separately. A desktop narrow viewport or Android bundle is not a physical native-app test.
7. Give **rotemyavne7** accepted GitHub **write** access (last checked: read), inspect final CI, and share administrator password privately.
