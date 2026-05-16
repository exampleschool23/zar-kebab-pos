import { useAuth } from '../contexts/AuthContext'

/** Returns true when the current user is a stakeholder (view-only role). */
export function useReadOnly() {
  const { profile } = useAuth()
  return profile?.role === 'stakeholder'
}
