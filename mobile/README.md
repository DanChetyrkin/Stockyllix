# Stockyllix client

One Expo SDK 58 / React Native / TypeScript app for web and mobile. See the repository README for the game rules, server, deployment and operating instructions.

## Run on Windows

```powershell
Set-Location "C:\Users\danch\OneDrive\Desktop\House of Finance Project\Stockyllix\mobile"
npm ci
if (-not (Test-Path -LiteralPath ".env.local")) { Copy-Item -LiteralPath ".env.example" -Destination ".env.local" }
# fill the public firebase settings and the api url in .env.local
npx expo start --web
```

Restart Expo after changing environment variables. `EXPO_PUBLIC_*` values are included in the client bundle. Never place a Firebase service-account key here. Without public Firebase settings and a valid HTTPS API URL, the sign-in screen explains the missing setup and disables authentication. Real-user tokens are never sent to an implicit localhost URL.

For local emulators, set `EXPO_PUBLIC_USE_EMULATORS=true`, use the same `demo-stockyllix` project ID as the API, and run the Auth emulator first. Only this explicit mode permits HTTP on loopback or private development addresses and a localhost API fallback. Use your computer's LAN address instead of `localhost` for a physical device. Local test accounts are documented in the repository runbook; they do not exist in production.

```powershell
npm run typecheck
npm run test:config
npm run test:auth
npm run test:theme
npm run test:requests
npm run test:name
npm run lint
npm run build:web
# after a real public api url and production settings are configured
npm run check:release
```

The web export is a single-page application in `dist`. Static hosting must rewrite application routes to `index.html`. There is no Expo API server in the web build.

## Responsibilities

- `src/app`: Expo Router screens for authentication, portfolio, markets, orders, daily review, leaderboard, How to play and administrator controls.
- `src/components`: shared layout and small UI primitives.
- `src/context`: Firebase identity, the server's shared-world status and persisted appearance.
- `src/api`: authenticated HTTP requests and response types. All game writes go through this API.
- `src/config`: platform-specific authentication initialization. Web uses browser persistence; native uses AsyncStorage.
- `src/hooks`: data loading that retains the last completed snapshot while the world advances.

An order's UUID and exact payload are stored before sending. An uncertain response can be retried with the same request ID, including after a reload. Server transactions enforce the balance and trading rules; UI checks are only for feedback. Administrator steps resume the persisted server job rather than creating a replacement.

**Advance clock** creates the server job and starts processing it automatically. **Resume & process** continues unfinished work after a pause, reload or interrupted response. Polling the clock does not restart every screen's in-flight request. Game reads retain their previous completed data during processing, or show a neutral waiting state when no completed data has loaded. Administrator controls remain reachable after a reload while portfolio initialization is paused.

The header's status button explains simulated/historical price data without repeated warning banners. Internal world/order/job IDs remain available to the API and logs rather than ordinary screen labels. How to play explains registration, cash reservations, execution, scoring and personal features.

The daily quiz follows the shared game date at midnight Israel time; appearance follows the real Israel clock. Real-day review visits are measured separately in the backend. The latest Bank of Israel reference-rate panel is separate from the historical FX used by the game and does not change order execution.

The published client uses `EXPO_PUBLIC_API_URL=https://stockyllix-api.onrender.com/api` and is available at [stockyllix.web.app](https://stockyllix.web.app). `check:release` checks the configured public HTTPS API health response and the intended Hosting origin's CORS access. It does not replace an authenticated cloud smoke test; see the repository verification notes for completed checks and remaining limits.

The small Firebase type augmentation matches the installed SDK's native export, which is absent from its shared declaration entry. The gRPC v1 override patches a transitive Firebase dependency; the client itself only imports Firebase App and Auth. Remaining dependency-audit findings in the Expo/lint toolchain must be reviewed separately; passing app checks does not imply a clean dependency audit.

Unused starter components and the reset script were removed. Native app icons and splash assets are retained because the Expo configuration references them. `/explore` redirects to `/market`.
