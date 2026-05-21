export function appMetaReducer(state, action) {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, user: action.payload }

    case 'LOGOUT':
      return { ...state, user: null, cart: [], currentTableId: null }

    case 'SET_TABLE':
      return { ...state, currentTableId: action.payload }

    case 'SET_LOADED':
      return { ...state, loaded: true, loadError: null }

    case 'SET_LOAD_ERROR':
      return { ...state, loaded: true, loadError: action.payload || 'Failed to load POS data' }

    case 'SET_CONNECTION_NOTICE':
      return { ...state, connectionNotice: action.payload || null }

    default:
      return state
  }
}
