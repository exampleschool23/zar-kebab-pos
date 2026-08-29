# Menu, Inventory, Media, Costs, and Tech Cards

Read this guide for menu products/categories, availability and visibility, media, prices/costs, inventory, archival, preparation estimates, and Tech Cards.

## Entry points

- Editors and customer surfaces: `src/pages/AdminMenu.jsx`, `src/pages/TechCards.jsx`, `src/pages/PublicMenu.jsx`, `src/pages/TelegramMiniApp.jsx`
- Shared menu and recipe logic: `src/lib/menuItems.js`, `src/lib/menuPricing.js`, `src/lib/menuMedia.js`, `src/lib/menuItemCosts.js`, `src/lib/techCards.js`
- Database writes and schema: `src/lib/db.js`, migrations `139`, `149`–`151`, and `154`–`156`
- Focused tests: `tests/menuItems.test.js`, `tests/menuArchiveSafety.test.js`, `tests/menuStock.test.js`, `tests/menuMedia.test.js`, `tests/techCards.test.js`, `tests/techCardsFeature.test.js`, `tests/sourceGuards.menu.test.js`, `tests/sourceGuards.public-menu.test.js`

## Visibility and availability

- `menu_items.available` affects waiter orderability only. Public and Telegram menus still show active unavailable meals.
- `public_hidden` is independent and owner-controlled. Non-owner saves preserve the stored value; new non-owner products default to public visibility.
- Manage Menu writers may create unavailable products and change availability. The database enforces both access rules.
- `cashier_only`, schedules, category visibility, option visibility, and `deleted_at` are separate controls.
- `deleted_at` is the archive boundary. Archived products/categories never reappear because of availability behavior.
- `stock_count` is shelf inventory and never determines menu visibility or orderability.

## Product creation, cost, and history

- Normal and cashier-quick products require a positive protected parent cost.
- Create a product and its cost atomically through the current media-aware creation RPC. Do not directly insert a public product first.
- Protected current costs live in `menu_item_costs`; variant costs live in `variant_costs`. Public option data contains names and selling prices only.
- `order_items.cost_price` is a sale-time database snapshot. Runtime reporting must never fall back to today's menu cost for missing historical coverage.
- Later price/cost edits affect future order items only. Never rewrite paid revenue, profit, reports, or saved order-item costs.
- Product/category deletion is archival; physical catalog deletion is rejected to preserve report lookups.
- The editor's profit margin is a live preview `(selling price - cost) / selling price`, not persisted data.

## Availability notifications

- Authenticated `available` transitions queue an immutable Telegram Team event with Russian product/staff snapshots.
- Product saves and quick toggles use the same database event; editing without a transition sends nothing.
- Archival must not change `available` or create an availability announcement.
- The daily 08:00 Tashkent snapshot lists unavailable active products by Russian category or confirms all are available. Details live in `docs/agent/telegram.md`.

## Inventory

- Payment deducts non-cancelled piece quantities exactly once in the atomic unpaid-to-paid transition.
- Parent and selected-variant stock clamp at zero; `orders.stock_deducted_at` prevents retry/correction double deduction.
- Weight-based inventory requires its decimal stock model; do not apply piece assumptions.
- Existing historical paid orders must never trigger new deductions.

## Media and text

- `media_urls[0]` is the cover and stays synchronized with `image_url`.
- Supported gallery media include images, GIF, MP4, and WebM. Cards/Telegram use the cover; customer and waiter detail views expose the gallery.
- Delete removed existing R2 media only after a successful product save. Clean up new temporary uploads on cancel or removal before save.
- Upload error rendering belongs inside `ImageUploadField`; `SortableItemCard` must not access that state.
- Trim localized names/descriptions at editor, write, display, and database boundaries while preserving internal spaces and description line breaks.
- `estimated_prep_minutes` is a localized current-catalog expectation from 1–180 minutes (default 15), not a historical order promise.
- Mobile archive uses touch-safe controls and an in-app retryable confirmation dialog, never `window.confirm()`.

## Tech Cards

- One active product may have one protected base recipe and one recipe per eligible variant. The empty `variant_option_id` identifies the backward-compatible base recipe.
- Ingredient rows and included-product component rows belong to the exact product-and-variant recipe. Batch ingredient cost divided by `portion_count`, plus per-portion component cost, is the current portion cost.
- Save the card and complete ingredient list atomically with `save_menu_item_tech_card(payload jsonb)`.
- `tech_cards` permission controls route/read access; Manage Menu separately controls writes.
- Ingredient prices and protected recipes never enter public, Telegram-menu, waiter, cashier, order, or receipt payloads.
- Saving a base recipe synchronizes the protected parent cost; saving a variant recipe synchronizes that option in protected `variant_costs`. Existing order-item cost snapshots remain untouched.
- Variant recipes may be copied and quantity-scaled, but the destination variant identity and its sellable portion count remain explicit.
- Structured components may choose a product variant through `selected_options`; empty means the base product.
- Variant calculation uses protected variant cost with protected parent-cost fallback. Changing parent selection clears stale options.
- Copy chosen options into immutable `order_items.tech_card_component_snapshot`; payment deducts included parent/variant stock once.
- The same parent may repeat only for distinct variants; exact parent-and-variant duplicates are invalid.
