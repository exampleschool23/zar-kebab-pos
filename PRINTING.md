# Receipt Printing

The web app prints receipts by calling `window.print()` from the receipt page.
Browsers do not allow JavaScript to select a printer by name, so the app does
not include printer selection UI.

## Windows Silent Print Setup

1. Install the Xprinter 80mm Windows driver.
2. Set Xprinter as the Windows default printer.
3. Disable **Let Windows manage my default printer**.
4. Open Chrome with kiosk printing:

```bat
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing https://zar-kebab-pos.vercel.app/
```

In this mode, `window.print()` prints directly to the default Windows printer.
Without `--kiosk-printing`, Chrome shows the normal print dialog.

## Paper

Receipt CSS is optimized for 80mm thermal paper:

- `@page size: 80mm auto`
- zero page margin
- black and white print styles
- only `.receipt-print-area` is visible during print
