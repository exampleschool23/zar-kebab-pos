import { getQuickSortOrder } from './reducerHelpers'

export function menuReducer(state, action) {
  switch (action.type) {
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload }

    case 'SET_MENU_ITEMS':
      return { ...state, menuItems: action.payload }

    case 'ADD_MENU_ITEM': {
      const maxItemOrder = state.menuItems.length > 0
        ? Math.max(...state.menuItems.map(i => i.sort_order ?? 0))
        : 0
      return { ...state, menuItems: [...state.menuItems, { sort_order: maxItemOrder + 1, ...action.payload }] }
    }

    case 'UPDATE_MENU_ITEM':
      return { ...state, menuItems: state.menuItems.map(i => i.id === action.payload.id ? action.payload : i) }

    case 'DELETE_MENU_ITEM':
      return { ...state, menuItems: state.menuItems.filter(i => i.id !== action.payload) }

    case 'REORDER_MENU_ITEM': {
      const { idA, idB } = action.payload
      const itemA = state.menuItems.find(i => i.id === idA)
      const itemB = state.menuItems.find(i => i.id === idB)
      if (!itemA || !itemB) return state
      const orderA = itemA.sort_order ?? 0
      const orderB = itemB.sort_order ?? 0
      return {
        ...state,
        menuItems: state.menuItems.map(i => {
          if (i.id === idA) return { ...i, sort_order: orderB }
          if (i.id === idB) return { ...i, sort_order: orderA }
          return i
        }),
      }
    }

    case 'REORDER_QUICK_ITEM': {
      const { idA, idB } = action.payload
      const itemA = state.menuItems.find(i => i.id === idA)
      const itemB = state.menuItems.find(i => i.id === idB)
      if (!itemA || !itemB) return state
      const orderA = getQuickSortOrder(itemA)
      const orderB = getQuickSortOrder(itemB)
      return {
        ...state,
        menuItems: state.menuItems.map(i => {
          if (i.id === idA) return { ...i, quick_item_sort_order: orderB }
          if (i.id === idB) return { ...i, quick_item_sort_order: orderA }
          return i
        }),
      }
    }

    case 'ADD_CATEGORY': {
      const realCats = state.categories.filter(c => c.id !== 'all')
      const maxCatOrder = realCats.length > 0
        ? Math.max(...realCats.map(c => c.sort_order ?? 0))
        : 0
      return { ...state, categories: [...state.categories, { sort_order: maxCatOrder + 1, ...action.payload }] }
    }

    case 'UPDATE_CATEGORY':
      return { ...state, categories: state.categories.map(c => c.id === action.payload.id ? action.payload : c) }

    case 'DELETE_CATEGORY':
      return { ...state, categories: state.categories.filter(c => c.id !== action.payload) }

    case 'REORDER_CATEGORY': {
      const { idA, idB } = action.payload
      const catA = state.categories.find(c => c.id === idA)
      const catB = state.categories.find(c => c.id === idB)
      if (!catA || !catB) return state
      const orderA = catA.sort_order ?? 0
      const orderB = catB.sort_order ?? 0
      return {
        ...state,
        categories: state.categories.map(c => {
          if (c.id === idA) return { ...c, sort_order: orderB }
          if (c.id === idB) return { ...c, sort_order: orderA }
          return c
        }),
      }
    }

    default:
      return state
  }
}
