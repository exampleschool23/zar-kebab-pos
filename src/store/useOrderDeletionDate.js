import { useEffect, useState } from 'react'
import { formatDateOnly } from '../lib/dateFormat.js'

// Refresh delete controls at Tashkent midnight, including suspended tabs.
export function useOrderDeletionDate() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => setNow(previous => {
      const current = new Date()
      return formatDateOnly(previous) === formatDateOnly(current) ? previous : current
    })
    const timer = setInterval(refresh, 1000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return now
}
