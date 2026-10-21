# BOR administration

Admin page: open the **same bot's Main Mini App** with the URL `https://bor-bot.vercel.app/?admin=1`. Only opening in Telegram provides signed initData. The admin route is not linked from public navigation.

## Required setting

In Vercel → bor-bot → Settings → Environment Variables → Production, set `ADMIN_TELEGRAM_IDS` to **your own numeric Telegram user ID**, e.g. `123456789`. Multiple IDs are supported, separated by commas. **This is not the bot ID or bot token.** Retrieve your user ID from Telegram's user-info bot, or the Telegram Bot API update metadata using a secure method. Do not send bot tokens or keys in chat.

The existing variables `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY` must remain set. Redeploy after changing env vars.

## Launch

The public Mini App remains at `https://bor-bot.vercel.app/`. To access the admin interface, set a second menu Web App link or open `https://bor-bot.vercel.app/?admin=1` using a Telegram Web App button. Opening the bare URL in Safari does not authenticate. Configure a Telegram menu button through BotFather or bot API; **Main Mini App with root URL will not automatically authenticate a raw Safari admin URL**.

Admin requests use `X-Telegram-Init-Data`; server validates Telegram's hash, max age 1 hour, and checks the numeric user ID against `ADMIN_TELEGRAM_IDS`. Public users receive HTTP 403; external browsers without signed Telegram initData receive HTTP 401. Secret Supabase key remains on the server. Only allow names, district, address, category and active boolean. No arbitrary SQL is accepted. Archiving sets `active=false`, preserving reports.

## Verify

1. Add verified place name + district + real address, click 'Добавить заведение'.
2. Check `/api/places` returns it, and public BOR displays the place.
3. Edit the place or set publication to 'Скрыто'. It should disappear from public results without being deleted.
4. Open public BOR inside Telegram; send a real observation, then verify a row appears in Supabase `public.reports`.

Never publish invented venues. The admin panel does **not** yet support batch import, geocoding, multi-role permissions, or audit logs.
