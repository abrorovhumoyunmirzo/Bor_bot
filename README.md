# BOR v1 — Telegram Mini App

BOR helps visitors find a quieter place and report crowding and Wi-Fi quality. This repository is structured for Vercel and Supabase.

## Deploy

1. Import this repository in [Vercel](https://vercel.com/new).
2. Framework: **Vite**; build: `npm run build`; output: `dist`. Node.js 22.
3. On the first deployment, the app uses **demo** mode: fake example venues, no reports saved. A demo card is not a real listing.
4. Create a [Supabase](https://supabase.com) project and run `supabase/schema.sql` in SQL Editor.
5. Add **verified real venues** into `public.places` manually; there are no real venues pre-seeded.
6. In Vercel project Settings > Environment Variables set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TELEGRAM_BOT_TOKEN`; redeploy. Keep secrets strictly server-side and outside git. The service-role key bypasses RLS.
7. Set the Vercel HTTPS URL as your Telegram bot's Mini App URL in [@BotFather](https://t.me/BotFather).

## Local development

```bash
npm install
npm run dev
npm run build
```

Environment variables are intentionally not required to render demo mode. Real reporting requires valid signed Telegram `initData`; opening a page in a normal browser cannot publish a report. The API refuses reports if backend credentials are missing. A Postgres trigger enforces a five-minute per-user/per-place cooldown even for concurrent API requests.

## Structure

- `src/App.tsx`: mobile UI (search, district filters, details, favorites, reports)
- `src/styles.css`: visual system
- `src/lib/`: types, API client, Telegram integration
- `api/`: Vercel serverless functions
- `supabase/schema.sql`: database and constraints
- `.github/workflows/ci.yml`: automatic build checks

## Product limitations

This is an initial production-shaped **MVP**, not a verified real-time service. Community reporting can be inaccurate. No map provider is configured, and the example places are illustrative only. Favorites are stored locally on the device. Security and load tests, production data validation, monitoring, and Telegram end-to-end testing remain necessary before public launch.
