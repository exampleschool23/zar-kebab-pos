import { withPriceModeFields } from '../lib/priceModes.js'
import { normalizeMenuQuantity } from '../lib/menuSaleUnits.js'

function getCartItemKey(item) {
  return item?.cart_item_key || item?.cartItemKey || item?.menu_item_id
}

function actionCartItemKey(payload) {
  return payload?.cart_item_key || payload?.cartItemKey || payload?.menu_item_id || payload
}

export function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_TO_CART': {
      const payloadKey = getCartItemKey(action.payload)
      const existing = state.cart.find(i => getCartItemKey(i) === payloadKey)
      const addQuantity = normalizeMenuQuantity(action.payload?.quantity, action.payload)
      if (existing) {
        return {
          ...state,
          cart: state.cart.map(i =>
            getCartItemKey(i) === payloadKey
              ? {
                  ...i,
                  ...action.payload,
                  quantity: normalizeMenuQuantity((Number(i.quantity) || 0) + addQuantity, i),
                  notes: action.payload?.notes ?? i.notes ?? '',
                }
              : i
          ),
        }
      }
      return {
        ...state,
        cart: [...state.cart, {
          ...action.payload,
          quantity: addQuantity,
          notes: action.payload?.notes ?? '',
        }],
      }
    }

    case 'REMOVE_FROM_CART':
      return { ...state, cart: state.cart.filter(i => getCartItemKey(i) !== actionCartItemKey(action.payload)) }

    case 'UPDATE_CART_QTY': {
      const { qty } = action.payload
      const key = actionCartItemKey(action.payload)
      if (Number(qty) <= 0) return { ...state, cart: state.cart.filter(i => getCartItemKey(i) !== key) }
      return {
        ...state,
        cart: state.cart.map(i => getCartItemKey(i) === key ? { ...i, quantity: normalizeMenuQuantity(qty, i) } : i),
      }
    }

    case 'UPDATE_CART_NOTES': {
      const { notes } = action.payload
      const key = actionCartItemKey(action.payload)
      return {
        ...state,
        cart: state.cart.map(i => getCartItemKey(i) === key ? { ...i, notes } : i),
      }
    }

    case 'UPDATE_CART_ITEM_FIELDS': {
      const { fields = {} } = action.payload
      const key = actionCartItemKey(action.payload)
      return {
        ...state,
        cart: state.cart.map(i => getCartItemKey(i) === key ? { ...i, ...fields } : i),
      }
    }

    case 'UPDATE_CART_PRICE_MODE': {
      return {
        ...state,
        cart: state.cart.map(item => withPriceModeFields(item, action.payload?.priceMode || action.payload)),
      }
    }

    case 'REPLACE_CART':
      return { ...state, cart: Array.isArray(action.payload) ? action.payload.map(item => ({ ...item })) : [] }

    case 'CLEAR_CART':
      return { ...state, cart: [] }

    default:
      return state
  }
}
