# Zar Kebab POS

## Telegram Bot and Mini App

This MVP connects Telegram to the existing web app and Supabase order flow. Telegram chat only opens the Mini App; menu, checkout, kitchen, cashier, and admin data stay in the same backend/database.

### Environment variables

Add these to local `.env.local` and to your deployment provider:

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEB_APP_URL=https://your-domain.com/telegram
TELEGRAM_SESSION_SECRET=use-a-long-random-string
VITE_TELEGRAM_BOT_USERNAME=your_bot_username
TELEGRAM_WEBHOOK_SECRET=use-a-different-long-random-string
CRON_SECRET=use-another-long-random-string
TELEGRAM_COMPLETED_ORDERS_CHAT_ID=
TELEGRAM_SALARY_PAYMENTS_CHAT_ID=
TELEGRAM_SALARY_PAYMENTS_LANGUAGE=ru
SUPABASE_SERVICE_ROLE_KEY=
```

Keep `TELEGRAM_BOT_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not prefix them with `VITE_`.
`VITE_TELEGRAM_BOT_USERNAME` contains only the bot's public username and is safe for the browser.
Set `TELEGRAM_COMPLETED_ORDERS_CHAT_ID` to the Telegram group chat id that should receive paid order completion messages. Add the bot to the group first; group and supergroup chat ids are usually negative numbers. You can also provide multiple chat ids separated by commas.
Set `TELEGRAM_SALARY_PAYMENTS_CHAT_ID` to the separate private group that
should receive salary-operation messages if migration `111` has not been
applied yet.
The setting is intentionally separate from `TELEGRAM_TEAM_CHAT_ID` and
`TELEGRAM_COMPLETED_ORDERS_CHAT_ID`, so salary details cannot be sent to the
wrong group as a fallback. Add the bot to that group and allow it to send
messages. `TELEGRAM_SALARY_PAYMENTS_LANGUAGE` defaults to `ru`.
After deploying the webhook code, send `/chatid` inside the salary group to
have the bot reply with the exact value to use for
`TELEGRAM_SALARY_PAYMENTS_CHAT_ID`.
`/start` also returns the chat id when used in a group. Language selection is
shown only in a private chat with the bot.
Migration `111` stores the confirmed salary-events group in Supabase and uses
it as the primary destination; the environment variable remains a deployment
fallback. Salary payments and fines notify both the group and the linked
employee. Bonuses and absences notify the group. None of these messages use
the team or completed-orders groups as a fallback. If a private employee link
is missing or disabled, the group notification is still attempted and tracked.

### BotFather setup

1. Create a bot with BotFather and copy the token into `TELEGRAM_BOT_TOKEN`.
2. Set the Mini App/Web App URL to `https://your-domain.com/telegram`.
3. Set `TELEGRAM_WEB_APP_URL` to the same URL.
4. Run the bot locally with:

```bash
npm run bot:telegram
```

The `/start` command sends a welcome message with an `Open Menu` button that opens the Mini App.

On Vercel, use Telegram webhooks instead of running the polling process. After deploying, register the production endpoint:

```bash
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://your-domain.com/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  -d 'allowed_updates=["message","callback_query"]'
```

Telegram webhooks and `npm run bot:telegram` polling cannot be active at the same time.

### Database setup

Run `supabase/017_telegram_integration.sql` in the Supabase SQL editor. It adds:

- `customers`
- `telegram_users`
- Telegram/customer/source fields on `orders`

For private employee salary notifications, also run
`supabase/107_employee_salary_telegram_notifications.sql`. It adds verified
employee links, expiring one-time tokens, and idempotent delivery history.
Run `supabase/108_employee_salary_payment_notification_deliveries.sql` and
`supabase/110_salary_payment_group_notifications.sql` to audit private
employee delivery and salary-group delivery independently.
Run `supabase/111_salary_group_event_notifications.sql` to configure the
salary-events group and track duplicate-safe bonus, fine, and absence delivery.

### Daily employee salary notifications

The Salaries page can generate a private employee link after migration `107`
is applied and `VITE_TELEGRAM_BOT_USERNAME` is configured. The employee opens
that link and presses Start. The token expires after 30 minutes and can be used
only once.

`vercel.json` invokes `/api/telegram/daily-salary` once per day at `19:00 UTC`,
which is midnight in `Asia/Tashkent`. Vercel automatically sends `CRON_SECRET` as a
Bearer token. Each message includes salary earned that day, that day's fines
and reasons, and the current amount due. The midnight message summarizes the
Tashkent calendar day that just finished. A unique delivery row prevents a
duplicate message for the same employee and date.

The Vercel Hobby scheduler may start at any point during the configured hour.
For exact timing, remove the Vercel cron entry and call the same endpoint from
Supabase Cron with `Authorization: Bearer <CRON_SECRET>`.

### Security notes

The Mini App reads `window.Telegram.WebApp.initData` and sends the raw string to `POST /api/telegram/auth`. The backend validates the signature with `TELEGRAM_BOT_TOKEN` before creating a signed app session. The frontend never trusts `initDataUnsafe` for authentication and never receives the bot token.

Telegram order creation uses `POST /api/telegram/order`. The backend reloads menu item prices from Supabase and ignores any custom prices sent by the client.
