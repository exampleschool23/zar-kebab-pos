export function getBillReceiptPath({ tableId, orderId }) {
  return orderId
    ? `/receipt/${encodeURIComponent(orderId)}?print=1`
    : `/receipt/table/${encodeURIComponent(tableId)}?print=1`
}

export function completeBillHandoff({
  navigate,
  tableId,
  autoPrint,
}) {
  const encodedTableId = encodeURIComponent(tableId)
  const printQuery = autoPrint ? '?print=1' : ''
  navigate(`/cashier/bill/${encodedTableId}${printQuery}`)
}
