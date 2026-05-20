import { useApp } from './AppContext'

export function useAppDataStatus() {
  const { state } = useApp()
  return {
    loaded: state.loaded,
    loadError: state.loadError,
    connectionNotice: state.connectionNotice,
  }
}

export function useOrders() {
  return useApp().state.orders
}

export function useCart() {
  return useApp().state.cart
}

export function useSettings() {
  return useApp().state.settings
}

export function useMenuData() {
  const { state } = useApp()
  return {
    categories: state.categories,
    menuItems: state.menuItems,
  }
}
