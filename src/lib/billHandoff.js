import { canMoveBackToTable } from './permissions.js'

// Only preflight fresh submissions; unknown attempts must reconcile their durable receipt first.
export function getKitchenBillBlockError(order, user) {
  if (order?.status !== 'needs_bill' || order.payment_status === 'paid' || canMoveBackToTable(user)) return null
  const error = new Error('Cashier access is required to move a bill back to its table')
  error.code = 'POS_BILL_WITH_CASHIER'
  return error
}

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
