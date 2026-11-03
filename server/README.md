# Stockyllix API on Render Free

The Blueprint is `render.yaml` at the repository root. It defines one Node web service with `plan: free` and `rootDir: server`. It creates no database or persistent disk. Automatic code deployment is disabled.

## Blueprint setup

Choose branch `codex/render-free-deploy` and Blueprint Path `render.yaml`.

Render prompts for these server environment variables:

| Variable | Value |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | The complete service-account JSON, entered only as a Render secret. A path on your Windows computer does not exist on Render. |
| `ADMIN_UIDS` | The intended administrator's Firebase Authentication UID; comma-separated for multiple administrators. |
| `CORS_ORIGINS` | Exact public HTTPS origins used by the web app, comma-separated. No trailing slash or `/api` path. |
| `DATASET_SEED` | A private random value of at least 32 characters. Keep it unchanged across deployments. |

The Firebase project is `stockyllix`. Keep Firebase on Spark and select Free for the Render service; do not add a payment card or enable billing. Local emulator settings and local demo accounts are not cloud credentials.

The build installs locked dependencies, imports historical ECB USD/ILS rates, compiles TypeScript, then removes development dependencies. It runs `npm start` and uses `/health` for health checks. Stock prices remain a labelled simulation; no paid stock API is required. The optional Bank of Israel reference panel uses the public official API.

Game data persists in Firestore. Render's local disk is temporary, so do not store portfolios or credentials in uploaded files there. Keep a private copy of the exact price dataset, FX file and seed; a changed dataset intentionally cannot take over an existing world.

The repository also includes Firebase rules that deny direct client access: all game reads/writes go through the authenticated API. Review existing cloud data/rules before deploying these with Firebase CLI. Uploading this Blueprint does not deploy Firebase rules, Hosting or the mobile app. The updated local client is a separate publication step.

## Local checks

From this directory:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Cloud deployment still needs actual Firebase credentials, IAM access and an authenticated smoke test. A successful build alone does not prove these. Once the API is deployed, its public HTTPS URL plus `/api` becomes the client's `EXPO_PUBLIC_API_URL` before Firebase Hosting deployment.

Never commit a service-account key, an actual `.env`, `node_modules`, private price files or emulator exports. `.env.example` contains placeholders only. The owner's `serverKey` directory stays outside this repository.
