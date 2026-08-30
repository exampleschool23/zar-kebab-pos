export function prepareBillPrintWindow(autoPrint, browserWindow = globalThis.window) {
  if (!autoPrint || typeof browserWindow?.open !== 'function') return null
  return browserWindow.open('', '_blank')
}

export function cancelBillPrintWindow(printWindow) {
  if (printWindow && !printWindow.closed && typeof printWindow.close === 'function') {
    printWindow.close()
  }
}

export function getBillReceiptPath({ tableId, orderId }) {
  return orderId
    ? `/receipt/${encodeURIComponent(orderId)}?print=1`
    : `/receipt/table/${encodeURIComponent(tableId)}?print=1`
}

export function completeBillPrint({
  navigate,
  tableId,
  orderId,
  printWindow,
  browserWindow = globalThis.window,
}) {
  const receiptPath = getBillReceiptPath({ tableId, orderId })
  if (printWindow && !printWindow.closed && typeof printWindow.location?.replace === 'function') {
    printWindow.location.replace(receiptPath)
    return
  }
  if (typeof navigate === 'function') {
    navigate(receiptPath)
    return
  }
  browserWindow?.open?.(receiptPath, '_blank', 'noopener')
}

export function completeBillHandoff({
  navigate,
  tableId,
  autoPrint,
  printWindow,
  browserWindow = globalThis.window,
}) {
  const encodedTableId = encodeURIComponent(tableId)
  navigate(`/cashier/bill/${encodedTableId}`)
  if (!autoPrint) return
  completeBillPrint({ tableId, printWindow, browserWindow })
}
