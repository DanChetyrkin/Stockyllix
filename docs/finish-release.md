# Finish the market-data release

This handoff distinguishes code readiness from a verified cloud connection. No payment card, paid subscription, new service or active-world reset is required for the current release.

## Deploy the existing Render service

1. Open the existing **stockyllix-api** service in Render. Keep **Free**, the existing Firebase secret, `DATASET_SEED`, `FX_DATA_PATH`, administrator UIDs and CORS origins unchanged.
2. Verify repository `DanChetyrkin/Stockyllix`, branch **codex/render-free-deploy**, root directory **server**. The existing Blueprint is **render.yaml** at the repository root.
3. Keep `CURRENT_MARKET_ACCESS=admin` and `NEWS_ACCESS=admin` (these are also the defaults). Do not set public-use confirmation flags merely because an API call succeeds.
4. Choose **Manual Deploy → Deploy latest commit**. Automatic deploy is disabled in this Blueprint.
5. Verify [health](https://stockyllix-api.onrender.com/health) returns `status: ok`, `version: 1.1.0`, and `release: market-feeds-v1`. HTTP 200 from the old release does not prove this update deployed.
6. Tell the project owner/agent that this exact release is live. Never paste a private environment value or complete environment screenshot into chat.

## See the result

- [Current market](https://stockyllix.web.app/current-market): official TradingView market panel. These are real-world, potentially delayed observations, not demo fills. The panel owns its source display/refresh and is not scraped by our API.
- Sign in as the configured administrator and open **Owner data preview → Open server preview**. `/api/market/current` must return twenty Yahoo entries, separate price and fetch timestamps, normalized ILS/USD, session/delay/stale labels and a next-refresh time.
- A second refresh within ten minutes must use the shared cache. A Render restart must reload the saved result/refresh lease from Firestore; it must not trigger one provider batch per visitor. A failed refresh keeps last good observations with old-data status.
- [Demo trading](https://stockyllix.web.app/market): prices remain tied to the game clock and current immutable dataset. Real-world quotes never fund or execute a demo order.
- [Market news](https://stockyllix.web.app/news): official TradingView news panel. Owner API preview is separate; no full article text is stored.

The embedded panels still need a real browser/phone check for all twenty symbols, attribution, links, delayed/session labels, responsive layout, reload and unavailable-source behaviour. They run in a sandboxed frame with no access to app storage. An HTTP export check cannot establish that an external widget rendered.

## Alpha Vantage News

The exact server variable is **ALPHA_VANTAGE_API_KEY**. It belongs only in ignored `server/.env` locally or Render's secret environment. It must never be `EXPO_PUBLIC_*`.

The supplied free key was tested locally: HTTP 200 contained a Premium requirement and no articles. Adding that same key to Render will not unlock News. No paid upgrade is needed for the TradingView public panel. If an account later obtains the necessary endpoint entitlement and public-display permission, configure the key on Render and redeploy. The cache stores headline metadata only, with a six-hour shared refresh, persistent request budgeting and explicit premium/quota failure states.

## Real historical replay

The existing public world must retain its exact source files and seed. A candidate is prepared separately from Yahoo daily history and BOI FX, with explicitly verified holidays and rejection of corporate actions in the selected period. Never overwrite `DATASET_PATH` or publish private future prices in Git.

Only after storage/public-display rights are established, securely deliver the private candidate through Render **Environment → Secret Files** as `yahoo-world.json`, then set `HISTORICAL_DATASET_PATH=/etc/secrets/yahoo-world.json` and `HISTORICAL_DATA_USE_CONFIRMED=true`. The staged file is about 42KB; Render documents a 1MB combined secret-file limit. See [official secret-file instructions](https://render.com/docs/configure-environment-variables#secret-files). Keep the original default dataset available. On the next deployment the administrator can choose **Real historical replay** in **World controls → Start a new world**. Typing RESET creates a new world; previous worlds and transactions remain intact. Do not perform this reset merely to check a deployment.

Before activating a real-data world, verify one buy before opening, one during trading, execution FX, 20% rejection, duplicate retry, a holiday, a multi-event clock jump, weekly ranking and end-of-data refusal. The new-world transition must preserve previous documents and must not migrate balances or holdings between worlds.

## Remaining submission checks

- Complete the authenticated quote fetch **from Render**, not only locally.
- Complete a cloud trade/clock scenario using an agreed demo world; avoid altering someone else's portfolio unexpectedly.
- Check a second physical device and Render cold start.
- Verify GitHub CI ran and `rotemyavne7` has accepted write access.
- Rehearse the explanation of source rights, delayed quotes, cache/fencing, world identity, transactions and idempotency.
