export function tablesReducer(state, action) {
  switch (action.type) {
    case 'SET_TABLES':
      return { ...state, tables: action.payload }

    case 'SET_TABLE_ZONES':
      return { ...state, tableZones: action.payload }

    case 'ADD_TABLE':
      return { ...state, tables: [...state.tables, action.payload] }

    case 'UPDATE_TABLE':
      return { ...state, tables: state.tables.map(t => t.id === action.payload.id ? action.payload : t) }

    case 'REORDER_TABLES': {
      const orderById = new Map((action.payload?.updates || []).map(update => [update.id, Number(update.sort_order)]))
      return {
        ...state,
        tables: state.tables.map(table => orderById.has(table.id)
          ? { ...table, sort_order: orderById.get(table.id) }
          : table),
      }
    }

    case 'DELETE_TABLE':
      return { ...state, tables: state.tables.filter(t => t.id !== action.payload) }

    case 'ADD_TABLE_ZONE':
      return { ...state, tableZones: [...(state.tableZones || []), action.payload] }

    case 'UPDATE_TABLE_ZONE':
      return {
        ...state,
        tableZones: (state.tableZones || []).map(z => z.id === action.payload.id ? action.payload : z),
      }

    default:
      return state
  }
}
