# Stockyllix app

One Expo SDK 58 / React Native / TypeScript app for the web and phones. It only displays the game: rules, balances, prices and the clock are enforced by the API. The live web build is at https://stockyllix.web.app.

## Where things are

| Folder | Responsibility |
| --- | --- |
| `src/app` | Expo Router screens: Portfolio (`index`), Demo trading (`market`), Orders, The league, Current market, News & daily question, How to play, World controls (`admin`) and sign-in. `/daily-review` redirects old links to News |
| `src/components` | The page shell with the scrolling header and clocks, menus, the daily quiz, market panels, the admin date fields and the shared UI kit |
| `src/context` | Sign-in and portfolio creation (`AuthContext`), the current world and test realm (`GameContext`), the theme |
| `src/api`, `src/hooks` | Authenticated requests with timeouts and request keys, and `useApi`, which keeps the last completed data while the clock syncs |
| `src/utils` | Pure helpers with node tests: order drafts and amounts, Israel date and time, calendar grid, execution wait text, sorting, names |
| `src/config` | Public Firebase and API settings for web and native, and theme colours |

Before sending, an order's request key and exact input are saved on the device. If the response is lost, the app retries the same request, and the server returns the same order instead of creating a second one.

## Commands

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build:web
```

`.env.example` holds the live game's public settings: copy it to `.env.local` and run `npx expo start` to open the app in Expo Go on a phone. `npm run check:release` checks the production settings and the API's health and CORS before publishing. Every `EXPO_PUBLIC_*` value ends up in the app bundle, so no server key belongs there. Emulator mode, Expo Go and deployment are in the [runbook](../docs/runbook.md).
