# Golden Hour

Golden Hour is a calm, mobile-first PWA for stepping outside around sunrise and sunset. It uses MongoDB Atlas for subscriber, reminder, and check-in data. Photos stay in the phone's IndexedDB and are never uploaded.

## Deploy to Render

`render.yaml` defines a Node web service with `npm install`, `node server.js`, and a `/health` check. Render's Blueprint uses `sync: false` for values that must be entered as secrets in the dashboard; see the [Render Blueprint specification](https://render.com/docs/blueprint-spec) and [environment variable guide](https://render.com/docs/configure-environment-variables).

1. Create a MongoDB Atlas database and allow the Render service to connect to it. Keep the Atlas URI private.
2. Create a new Render Blueprint from this repository and apply `render.yaml`.
3. Enter these prompted secret values for the web service: `MONGODB_URI`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `TICK_SECRET`.
4. Generate VAPID keys locally with `npx web-push generate-vapid-keys`, then copy them into Render. Use a strong random value for `TICK_SECRET`.
5. Deploy and verify `https://<your-service>.onrender.com/health` returns `{ "ok": true }`. Render health checks require a successful 2xx/3xx response; the app binds to Render's host and injected `PORT` ([health checks](https://render.com/docs/health-checks), [web services](https://render.com/docs/web-services)).
6. Initialize MongoDB indexes using the production URI from a trusted machine or a Render shell:

   ```bash
   node scripts/init-db.js
   ```

7. Run the local-only Gemma nudge generator separately when you want to refresh `data/nudges.json`:

   ```bash
   node scripts/make_nudges.js
   ```

The Blueprint also provisions a Render Postgres database because the deployment request included one. The current application deliberately does not use it: runtime persistence is MongoDB Atlas, so there is no `DATABASE_URL` and no Postgres adapter in this project. Remove the `databases` block if that unused Render database is not needed.

For a production reminder loop, call `POST /api/tick` from a scheduler and send the `x-tick-secret` header. The development-only `?force=1` tick path is disabled when `NODE_ENV=production`.

## Local development

```bash
npm install
copy .env.example .env
npm start
```

Fill in `.env` with MongoDB Atlas and Web Push values. Never commit `.env` or print its contents.

## Why open source?

- Sun times are calculated offline with SunCalc.
- Messages are written by the open-weight Gemma model running locally through Ollama.
- Photos never leave the phone; they are stored in device-local IndexedDB.
- There are no third-party AI API keys or per-use AI costs. Web Push and MongoDB still require their normal service credentials.

## Data shapes

- `subscribers`: endpoint, `keys { p256dh, auth }`, lat, lon, IANA `tz`, sunrise/sunset preferences, lead time, and `createdAt`.
- `reminders`: subscriber, sunrise/sunset kind, event time, fire time, and nullable sent time.
- `checkins`: subscriber, kind, local date, optional treat, and creation time.
