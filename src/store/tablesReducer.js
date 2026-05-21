export function tablesReducer(state, action) {
  switch (action.type) {
    case 'SET_TABLES':
      return { ...state, tables: action.payload }

    case 'ADD_TABLE':
      return { ...state, tables: [...state.tables, action.payload] }

    case 'UPDATE_TABLE':
      return { ...state, tables: state.tables.map(t => t.id === action.payload.id ? action.payload : t) }

    case 'DELETE_TABLE':
      return { ...state, tables: state.tables.filter(t => t.id !== action.payload) }

    default:
      return state
  }
}
