# Waiter Ordering, Tables, and Kitchen

Read this guide for waiter tables, table entry, carts, price modes, reservations, kitchen submission, kitchen rounds, and kitchen checks.

## Entry points

- Waiter and kitchen UI: `src/pages/WaiterTables.jsx`, `src/pages/WaiterOrder.jsx`, `src/pages/KitchenCheckReceipt.jsx`, `src/components/CartPanel.jsx`
- State and shared logic: `src/store/cartReducer.js`, `src/store/ordersReducer.js`, `src/lib/kitchenCheck.js`, `src/lib/tableActivity.js`, `src/lib/priceModes.js`
- Database orchestration: `src/lib/db.js`, kitchen migrations `096`, `127`, and `128`
- Focused tests: `tests/operationalFlows.test.js`, `tests/kitchenCheck.test.js`, `tests/kitchenSubmissionRecovery.test.js`, `tests/kitchenSubmissionReducer.test.js`, `tests/priceModes.test.js`, `tests/writeTimeout.test.js`, `tests/sourceGuards.ordering.test.js`

## Table entry and price mode

- Opening a table is a direct compact Regular/Tourist (`R`/`T`) choice followed by Enter table. Do not ask for a PIN or create a Guest session.
- Opening a table alone never creates an order. The waiter builds a cart and sends it normally.
- Reserved-table seating clears reservation fields before entering ordering.
- Active non-empty orders keep their saved price mode locked. Conflicting active modes require staff review.
- Empty shells, stale totals without items, and all-cancelled orders must not lock price mode or show an active-order notice.
- Before a kitchen order exists, a non-empty cart's saved `price_mode` is authoritative.
- Recalculate plain products and configured variants from immutable `base_price`; never compound Tourist markup.
- Paid order items are historical snapshots and are never repriced.

## Cart and waiter availability

- Configured-option additions start at quantity one and increment only the matching `cart_item_key`.
- Reject unavailable or archived products at add, increment, detail submit, kitchen submit, and the database boundary.
- `stock_count` is inventory, not an availability flag.
- The waiter header reports submitted quantities when an active order exists; it must not say the order is empty merely because the unsent cart is empty.
- Submitted kitchen rounds remain visible while a new cart batch is built. Derive stable `Order 1`, `Order 2`, etc. numbering from the complete chronological round list before filtering controls.

## Kitchen submission

- `WaiterOrder` owns send state. `CartPanel` receives `isSending` and `onSendingChange`; do not restore an independent local send state.
- While sending or reconciling an unknown result, block repeated taps, cart/menu mutation, and table navigation.
- Capture an immutable submission snapshot and remove only those sent cart items after confirmed success. Never replace the cart with `[]`.
- Every retry reuses the same table, order, item, kitchen-round, price-mode, and service-rate identities.
- A timeout is an unknown outcome. Query the durable `order_kitchen_rounds` receipt first, then use exact live item/cancellation matching only as a rolling-deployment fallback.
- Treat a fully committed exact round as success even if the browser lost the response. Keep missing or partial outcomes retryable with the same identity.
- Durable round receipts survive later payment, cancellation, or row deletion and are the idempotency boundary. A retry must never resurrect an old round.
- The database must reject late inserts into paid orders and stale archived/unavailable products.

## Kitchen checks and printing

- Requested rounds must match exactly; never substitute an older local round while the requested one loads.
- Refresh a missing round directly before printing and auto-print each round only once.
- Failed print/submission retries retain the same round and item ids.
- See `PRINTING.md` for receipt-printer setup.

## Tables

- Disabled tables remain available to reports/history but are hidden from waiter ordering.
- Table edit/delete controls belong to `/admin/tables`, not the waiter grid.
- Never hard-delete a table with active orders or historical references; verify history on demand before archival/deletion decisions.
