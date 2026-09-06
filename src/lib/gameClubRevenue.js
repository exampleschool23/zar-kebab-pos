import { getOrderRevenueTotal, isPaidOrder } from './analytics.js'
import { inferOrderType } from './orderTypes.js'

// Use immutable paid totals, including both price modes and all payment methods.
export function getGameClubRevenue(orders = []) {
  return orders.reduce((total, order) => total + (
    isPaidOrder(order) && order.status !== 'cancelled' && inferOrderType(order) === 'game_club'
      ? getOrderRevenueTotal(order)
      : 0
  ), 0)
}
