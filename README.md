# Zar Kebab POS

## Telegram Bot and Mini App

This MVP connects Telegram to the existing web app and Supabase order flow. Telegram chat only opens the Mini App; menu, checkout, kitchen, cashier, and admin data stay in the same backend/database.

### Environment variables

Add these to local `.env.local` and to your deployment provider:

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEB_APP_URL=https://your-domain.com/telegram
TELEGRAM_SESSION_SECRET=use-a-long-random-string
SUPABASE_SERVICE_ROLE_KEY=
```

Keep `TELEGRAM_BOT_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not prefix them with `VITE_`.

### BotFather setup

1. Create a bot with BotFather and copy the token into `TELEGRAM_BOT_TOKEN`.
2. Set the Mini App/Web App URL to `https://your-domain.com/telegram`.
3. Set `TELEGRAM_WEB_APP_URL` to the same URL.
4. Run the bot locally with:

```bash
npm run bot:telegram
```

The `/start` command sends a welcome message with an `Open Menu` button that opens the Mini App.

### Database setup

Run `supabase/017_telegram_integration.sql` in the Supabase SQL editor. It adds:

- `customers`
- `telegram_users`
- Telegram/customer/source fields on `orders`

### Security notes

The Mini App reads `window.Telegram.WebApp.initData` and sends the raw string to `POST /api/telegram/auth`. The backend validates the signature with `TELEGRAM_BOT_TOKEN` before creating a signed app session. The frontend never trusts `initDataUnsafe` for authentication and never receives the bot token.

Telegram order creation uses `POST /api/telegram/order`. The backend reloads menu item prices from Supabase and ignores any custom prices sent by the client.
