# Menu, Inventory, Media, Costs, and Tech Cards

Read this guide for menu products/categories, availability and visibility, media, prices/costs, inventory, archival, preparation estimates, and Tech Cards.

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

- One active product may have one protected recipe with ordered ingredient rows. Batch ingredient cost divided by `portion_count` is the current portion cost.
- Save the card and complete ingredient list atomically with `save_menu_item_tech_card(payload jsonb)`.
- `tech_cards` permission controls route/read access; Manage Menu separately controls writes.
- Ingredient prices and protected recipes never enter public, Telegram-menu, waiter, cashier, order, or receipt payloads.
- Saving a recipe synchronizes its calculated portion cost into protected catalog cost for future sales. Existing order-item cost snapshots remain untouched.
- Structured components may choose a product variant through `selected_options`; empty means the base product.
- Variant calculation uses protected variant cost with protected parent-cost fallback. Changing parent selection clears stale options.
- Copy chosen options into immutable `order_items.tech_card_component_snapshot`; payment deducts included parent/variant stock once.
- The same parent may repeat only for distinct variants; exact parent-and-variant duplicates are invalid.
