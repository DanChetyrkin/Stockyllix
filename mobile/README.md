# Stockyllix client

One Expo SDK 58 / React Native / TypeScript app for Web and mobile. Game rules, balances, prices and clock are enforced by the existing Node API. Current usage is in [How to play](https://stockyllix.web.app/help) and the [reviewer guide](../docs/reviewer-demo.md).

## Run on Windows

```powershell
Set-Location -LiteralPath "C:\Users\danch\OneDrive\Desktop\House of Finance Project\Stockyllix\mobile"
npm ci
if (-not (Test-Path -LiteralPath ".env.local")) { Copy-Item -LiteralPath ".env.example" -Destination ".env.local" }
npx expo start --web
```

Fill the public Firebase settings/API before starting and restart Expo after env changes. All `EXPO_PUBLIC_*` values are visible in the app bundle; no server key or private seed belongs here. Missing/invalid settings disable sign-in with an explanation rather than sending real-user tokens to an implicit localhost fallback.

For local emulators use `demo-stockyllix`, explicit `EXPO_PUBLIC_USE_EMULATORS=true`, local API/Auth emulator addresses and the local seed accounts in the [runbook](../docs/runbook.md). These accounts do not exist in production. A phone uses the computer's reachable LAN address, never loopback, for a local API/emulator.

For Expo Go against the public game use the genuine deployed Firebase Web config, `EXPO_PUBLIC_API_URL=https://stockyllix-api.onrender.com/api`, project `stockyllix`, emulators false, and no Auth emulator URL. Preserve emulator settings in an ignored non-autoloaded backup before switching. Then:

```powershell
npx expo start --go --clear
```

Scan the QR from a reachable phone network. This is distinct from the public Web link and from Android/Hermes bundle compilation. Actual device acceptance is recorded separately in verification.

## Responsibilities and behavior

- `src/app`: Expo Router screens, including Portfolio, Demo trading, Orders, league, Current market, News/quiz, Help and administrator controls. `/daily-review` redirects to News; metrics remain on Portfolio.
- `src/components`: shared layout/UI; `src/context`: identity, world/realm and appearance; `src/api`: authenticated requests/types; `src/config`: Web/native Auth initialization; `src/hooks`: resource loading with retained completed data.
- Web sign-in persists through Firebase; native uses AsyncStorage. An order UUID/exact payload is saved before sending and scoped by user/realm/world. Receipt checking and retry preserve that request; accepted orders are never cancelled by clearing a local draft.
- Portfolio separates total cash, reservation, available cash, holdings and total value. Orders uses vertical phone rows, with amount/status/execution time visible. Busy/error/end reasons offer the relevant action.
- Game time is server-derived, 1× while running, and distinct from current Israel time. Administrator controls use normal Israel date/time, pending-execution and market-event shortcuts; server validation handles DST, permissions and bounds. Worker recovery lives in advanced diagnostics.
- The shared league uses immutable real history. Explicit generated-price simulations exist only in the administrator's separate test game, never as real/current quotes. Realm changes clear stale resource/draft state.
- Current TradingView market/news panels are independent of fills and can be delayed. The daily question uses the game's Israel day; appearance uses the real Israel clock. Real return visits are measured separately.

## Checks and Web release

```powershell
npm run typecheck
npm run lint
node --test scripts/*.test.mjs
npm run build:web
npm run check:release
```

`dist` is a static SPA; Firebase Hosting rewrites routes to `index.html`. Build with ignored production configuration and emulators false; check the actual loaded API/project before publishing. The release gate checks HTTPS health/config/CORS, not authenticated trading or a native phone session. See [release gates](../docs/finish-release.md) and [measured evidence](../docs/verification.md).

The Firebase native type augmentation matches the installed SDK export. Dependency audit findings are dated separately; successful app checks do not imply a clean audit. Retain icons/splash assets referenced by Expo configuration. Keep generated native directories and unused starter screens out of this managed app.
