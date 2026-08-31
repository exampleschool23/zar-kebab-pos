# Architecture, State, Auth, and Realtime

Read this guide for app startup, authentication, routes, permissions, shared state, hydration, and realtime work.

## Entry points

- Routes and host boundaries: `src/App.jsx`
- Authentication and profile loading: `src/contexts/AuthContext.jsx`, `src/lib/profileLoading.js`
- Shared state and selectors: `src/store/AppContext.jsx`, `src/store/appHooks.js`, `src/store/`
- Permissions and database orchestration: `src/lib/permissions.js`, `src/lib/db.js`
- Focused tests: `tests/permissions.test.js`, `tests/profileLoading.test.js`, `tests/dbRealtime.test.js`, `tests/sourceGuards.architecture.test.js`

## Routes and access

- Public routes: `/menu`, `/telegram`, authentication and password-reset routes.
- Waiter routes: `/waiter/tables`, `/waiter/order/:tableId`, `/waiter/take-away`.
- Kitchen check: `/kitchen-check/:orderId`; the retired `/kitchen` screen redirects to `/admin`.
- Cashier routes: `/cashier/tables`, bill and receipt routes.
- Admin routes include dashboard, menu, tech cards, tables, users, reports, audit, settings, Accounting, Salaries, Daily Bazaar, and its ingredient catalog at `/admin/bazaar/ingredients`.
- Centralize role and feature rules in `src/lib/permissions.js`. Do not duplicate access decisions in pages without matching database enforcement.
- Menu catalog archival is limited to owners who also have Manage Menu access; admins keep ordinary menu editing. The UI permission and database archive trigger must stay aligned.

## State architecture

`AuthContext` reads Supabase authentication/profile data. `ProfileSync` in `src/App.jsx` mirrors stable profile fields into `AppContext` with `LOGIN`.

`AppContext` owns settings, user, tables, menu, orders, cart, connection notice, and load state. Domain reducers under `src/store/` own mutations. Keep `AppContext.jsx` limited to initialization, reducer composition, hydration, realtime, and database dispatch orchestration.

Critical invariants:

- `dbDispatch` must remain wrapped in `useCallback`. An unstable dispatch can make `ProfileSync` loop forever.
- `ProfileSync` dependencies stay field-based: profile id, role, full name, email, and dispatch.
- Realtime channel names must be unique; do not restore a fixed `pos-realtime` channel.
- Realtime includes `business_settings` so service and other live settings refresh correctly.
- Add focused selectors to `src/store/appHooks.js` rather than spreading direct state-shape knowledge through pages.

## Hydration boundaries

- Operational state contains every active order regardless of age and only today's paid orders needed for cashier/recent activity.
- Never load full paid-order history during initial hydration or realtime refresh.
- Dashboard, reports, Accounting, and receipts use their own bounded history loaders.
- `WaiterTables` refreshes operational tables/orders on mount and browser back-forward restoration without clearing the visible grid.
- The stable `refreshPOSData` callback renews realtime and preserves current cards while reloading.

## Compatibility

`src/lib/db.js` contains temporary fallbacks for missing RPCs/relations so the UI remains usable during deployment order. Production should still apply every migration. Use `npm run db:health` before changing loading code when the console reports missing database objects.
