import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './store/AppContext'
import Login from './pages/Login'
import WaiterTables from './pages/WaiterTables'
import WaiterOrder from './pages/WaiterOrder'
import Kitchen from './pages/Kitchen'
import CashierTables from './pages/CashierTables'
import CashierBill from './pages/CashierBill'
import Receipt from './pages/Receipt'
import AdminDashboard from './pages/AdminDashboard'
import AdminMenu from './pages/AdminMenu'
import AdminTables from './pages/AdminTables'
import Reports from './pages/Reports'

function defaultPath(role) {
  if (role === 'admin') return '/admin'
  if (role === 'waiter') return '/waiter/tables'
  if (role === 'cashier') return '/cashier/tables'
  if (role === 'kitchen') return '/kitchen'
  return '/login'
}

function ProtectedRoute({ children, roles }) {
  const { state } = useApp()
  if (!state.user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(state.user.role)) return <Navigate to={defaultPath(state.user.role)} replace />
  return children
}

function AppRoutes() {
  const { state } = useApp()
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/waiter/tables" element={
        <ProtectedRoute roles={['waiter', 'admin']}><WaiterTables /></ProtectedRoute>
      } />
      <Route path="/waiter/order/:tableId" element={
        <ProtectedRoute roles={['waiter', 'admin']}><WaiterOrder /></ProtectedRoute>
      } />

      <Route path="/kitchen" element={
        <ProtectedRoute roles={['kitchen', 'admin']}><Kitchen /></ProtectedRoute>
      } />

      <Route path="/cashier/tables" element={
        <ProtectedRoute roles={['cashier', 'admin']}><CashierTables /></ProtectedRoute>
      } />
      <Route path="/cashier/bill/:tableId" element={
        <ProtectedRoute roles={['cashier', 'admin']}><CashierBill /></ProtectedRoute>
      } />
      <Route path="/receipt/:orderId" element={
        <ProtectedRoute roles={['cashier', 'admin']}><Receipt /></ProtectedRoute>
      } />

      <Route path="/admin" element={
        <ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>
      } />
      <Route path="/admin/menu" element={
        <ProtectedRoute roles={['admin']}><AdminMenu /></ProtectedRoute>
      } />
      <Route path="/admin/tables" element={
        <ProtectedRoute roles={['admin']}><AdminTables /></ProtectedRoute>
      } />
      <Route path="/admin/reports" element={
        <ProtectedRoute roles={['admin']}><Reports /></ProtectedRoute>
      } />

      <Route path="*" element={
        <Navigate to={state.user ? defaultPath(state.user.role) : '/login'} replace />
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  )
}
