export function prepareBillPrintWindow(autoPrint, browserWindow = globalThis.window) {
  if (!autoPrint || typeof browserWindow?.open !== 'function') return null
  return browserWindow.open('', '_blank')
}

export function cancelBillPrintWindow(printWindow) {
  if (printWindow && !printWindow.closed && typeof printWindow.close === 'function') {
    printWindow.close()
  }
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

  const receiptPath = `/receipt/table/${encodedTableId}?print=1`
  if (printWindow && !printWindow.closed && typeof printWindow.location?.replace === 'function') {
    printWindow.location.replace(receiptPath)
    return
  }
  browserWindow?.open?.(receiptPath, '_blank', 'noopener')
}
