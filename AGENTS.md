# Zar Kebab POS Agent Context

This file is the AI-friendly project map. Read it before changing code so future work does not repeat the recent loading, service-rate, and kitchen-submit regressions.

## Project Snapshot

Zar Kebab POS is a Vite React 18 app backed by Supabase. It supports public menu viewing, waiter ordering, kitchen order preparation, cashier billing, admin management, reports, and a Telegram mini app/bot integration.

Core stack:
- React + React Router in `src/App.jsx`
- Shared POS state in `src/store/AppContext.jsx`
- Supabase reads/writes/realtime in `src/lib/db.js`
- Payment, service, reporting, and cart math in `src/lib/analytics.js`
- Dashboard analytics in `src/lib/dashboardAnalytics.js`
- SQL migrations in `supabase/`
- Node test runner tests in `tests/`

## Local Commands

Use these from the repo root:

```bash
npm run dev
npm test
npm run build
npm run bot:telegram
```

Equivalent direct commands used in this environment:

```bash
/Users/hoggish/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test
/Users/hoggish/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js build
/Users/hoggish/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js --host 127.0.0.1
```

## Routes And Roles

Routes live in `src/App.jsx`.

Public:
- `/` redirects based on auth/profile role.
- `/menu` is the public menu.
- `/telegram` is the Telegram mini app.
- `/login`, `/auth/callback`, `/reset-password`, `/pending-approval`.

Protected:
- Waiter: `/waiter/tables`, `/waiter/order/:tableId`, `/waiter/take-away`
- Kitchen: `/kitchen`
- Cashier: `/cashier/tables`, `/cashier/bill/:tableId`, `/cashier/bill/order/:orderId`, receipt routes
- Admin/reporting: `/admin`, `/admin/menu`, `/admin/tables`, `/admin/users`, `/admin/reports`, `/admin/audit`, `/admin/settings`

Role access rules are centralized in `src/lib/permissions.js`.

## Data Flow

`AuthContext` reads Supabase auth/profile. `ProfileSync` in `src/App.jsx` mirrors that profile into `AppContext` with a `LOGIN` action.

`AppContext` owns local POS state:
- settings
- user
- tables
- menu items/categories
- orders
- cart
- connection notice
- loaded flag

`AppProvider` hydrates from Supabase with `loadPOSData()`, subscribes with `subscribeToRealtime()`, and exposes `dispatch: dbDispatch`. `dbDispatch` is intentionally wrapped in `useCallback`; do not make it unstable or `ProfileSync` can re-dispatch forever and make the website load forever.

## Recent Regression Context

These bugs were recently fixed and are now protected by tests:

1. Service rate was set to 15% but not consistently applied.
   - Realtime now includes `business_settings`.
   - Service-rate normalization lives in `normalizeServiceRatePct()` in `src/lib/analytics.js`.
   - Payment summaries should use `getOrderPaymentSummary()` / `getOrderPaymentFields()`, not hand-rolled total math.

2. Send to kitchen looked stuck after tapping.
   - `CartPanel` accepts parent-controlled `isSending` and `onSendingChange`.
   - `WaiterOrder` owns `isSendingOrder`, blocks cart/menu mutations during send, and passes send state to `CartPanel`.
   - Do not reintroduce independent local send state inside `CartPanel`.

3. Sending to kitchen could clear cart items added during a pending send.
   - `removeSentCartItems(cart, sentSnapshot)` removes only the submitted snapshot.
   - Do not replace this with `cart: []` in `SEND_TO_KITCHEN`.

4. App/kitchen/admin pages could load forever.
   - Root cause was an unstable `dispatch` causing `ProfileSync` to repeatedly dispatch `LOGIN`.
   - `dbDispatch` must stay stable.
   - `ProfileSync` deps should stay field-based: profile id, role, full name, email, and dispatch.

5. Supabase realtime/HMR could reuse a stale channel.
   - Realtime channel names are unique, currently `pos-realtime-${Date.now()}-...`.
   - Do not go back to a fixed `pos-realtime` channel name.

6. Admin menu crashed because upload `error` was rendered inside the wrong component.
   - Upload error rendering belongs inside `ImageUploadField`.
   - `SortableItemCard` must not reference the upload `error` state.

## Database Migrations

Run migrations in order. Important recent files:

- `supabase/011_business_settings.sql`
  Adds `business_settings`, including `service_rate_pct`. Required for admin settings and live service-rate changes.

- `supabase/012_split_order_payments.sql`
  Adds `order_payments`. Without it, split payment reporting falls back and logs warnings.

- `supabase/018_submit_order_to_kitchen_rpc.sql`
  Adds `submit_order_to_kitchen(payload jsonb)`. This atomically upserts the order/items/table status and rejects late inserts into already paid orders.

If the app logs missing `business_settings` or `order_payments`, applying only `018` is not enough.

## Supabase Notes

`src/lib/db.js` has fallbacks for older databases:
- Missing `submit_order_to_kitchen` RPC falls back to client-side writes.
- Missing `order_payments` relation falls back to loading orders without split payments.
- Missing `business_settings` falls back to local defaults.

These fallbacks keep the UI alive, but production should have all migrations applied.

## Payment And Service Rules

Use shared helpers in `src/lib/analytics.js`.

Key rules:
- Dine-in orders can have service.
- Take-away orders always have zero service, even if restaurant service is configured.
- Loyalty discount applies after subtotal plus service, according to existing helper behavior.
- Counter items are included in total but excluded from service and loyalty discount where the helper says so.
- Paid revenue should be stable across refresh/regrouping.

Before changing totals, add/update tests in `tests/orderPayment.test.js`.

## Kitchen Submit Flow

Main UI files:
- `src/pages/WaiterOrder.jsx`
- `src/components/CartPanel.jsx`
- `src/store/AppContext.jsx`
- `src/lib/db.js`
- `supabase/018_submit_order_to_kitchen_rpc.sql`

Expected behavior:
- Tap Send to Kitchen once.
- Button shows loading text/spinner state.
- Repeated taps and cart/menu mutations are blocked while send is pending.
- Only sent snapshot items are removed after success.
- New cart items added after the submitted snapshot must survive.
- Paid orders must not receive late kitchen inserts.

## Tests

Tests use Node's built-in test runner. Current files:

- `tests/dashboardAnalytics.test.js`
  Dashboard period and analytics behavior.

- `tests/dbRealtime.test.js`
  Realtime subscriptions, business settings reloads, connection notices.

- `tests/orderPayment.test.js`
  Core payment, service, loyalty, cart, split payment, cashier, take-away, and reporting rules.

- `tests/sourceGuards.test.js`
  Source-level regression guards for the recent failures. These are intentional guardrails, not broad lint rules.

Always run:

```bash
npm test
npm run build
```

## Source Guard Coverage

`tests/sourceGuards.test.js` protects at least these cases:
- Admin upload error stays inside `ImageUploadField`.
- `SortableItemCard` does not reference upload `error`.
- Only one upload error render exists.
- `ProfileSync` dependencies stay stable.
- `dbDispatch` remains wrapped in `useCallback`.
- Realtime channel names stay unique.
- No `console.log()` debugging in `src`.
- No blocking `alert()` calls in `src`.
- `CartPanel` receives send state from its parent.
- `WaiterOrder` blocks mutations while sending.
- AppContext removes only sent snapshot cart items.
- Kitchen RPC rejects already paid/unavailable orders.

If these tests fail, understand why before changing the guard. They exist because these exact failures reached the user.

## Frontend Verification Notes

Unauthenticated browser checks redirect protected routes to `/menu`. To verify `/kitchen` or `/admin/menu` visually, use an authenticated profile with the right role.

The Vite build currently emits a large chunk warning. That warning is known and not the same as a failing build.

## Common Gotchas

- Do not compute totals differently in different pages. Route everything through `analytics.js`.
- Do not make `dispatch` unstable in context providers consumed by effects.
- Do not use blocking browser dialogs for operational errors; use visible UI state.
- Do not clear the whole cart after async submits.
- Do not assume applying migration `018` means the database has `011` or `012`.
- Do not trust old browser console logs after hot reloads without checking timestamps.

