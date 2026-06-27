import { withPriceModeFields } from '../lib/priceModes.js'

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
      if (existing) {
        return {
          ...state,
          cart: state.cart.map(i =>
            getCartItemKey(i) === payloadKey
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        }
      }
      return { ...state, cart: [...state.cart, { ...action.payload, quantity: 1, notes: '' }] }
    }

    case 'REMOVE_FROM_CART':
      return { ...state, cart: state.cart.filter(i => getCartItemKey(i) !== actionCartItemKey(action.payload)) }

    case 'UPDATE_CART_QTY': {
      const { qty } = action.payload
      const key = actionCartItemKey(action.payload)
      if (qty <= 0) return { ...state, cart: state.cart.filter(i => getCartItemKey(i) !== key) }
      return {
        ...state,
        cart: state.cart.map(i => getCartItemKey(i) === key ? { ...i, quantity: qty } : i),
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

    case 'CLEAR_CART':
      return { ...state, cart: [] }

    default:
      return state
  }
}
