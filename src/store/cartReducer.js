export function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_TO_CART': {
      const existing = state.cart.find(i => i.menu_item_id === action.payload.menu_item_id)
      if (existing) {
        return {
          ...state,
          cart: state.cart.map(i =>
            i.menu_item_id === action.payload.menu_item_id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        }
      }
      return { ...state, cart: [...state.cart, { ...action.payload, quantity: 1, notes: '' }] }
    }

    case 'REMOVE_FROM_CART':
      return { ...state, cart: state.cart.filter(i => i.menu_item_id !== action.payload) }

    case 'UPDATE_CART_QTY': {
      const { menu_item_id, qty } = action.payload
      if (qty <= 0) return { ...state, cart: state.cart.filter(i => i.menu_item_id !== menu_item_id) }
      return {
        ...state,
        cart: state.cart.map(i => i.menu_item_id === menu_item_id ? { ...i, quantity: qty } : i),
      }
    }

    case 'UPDATE_CART_NOTES': {
      const { menu_item_id, notes } = action.payload
      return {
        ...state,
        cart: state.cart.map(i => i.menu_item_id === menu_item_id ? { ...i, notes } : i),
      }
    }

    case 'CLEAR_CART':
      return { ...state, cart: [] }

    default:
      return state
  }
}
