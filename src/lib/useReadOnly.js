import { useAuth } from '../contexts/AuthContext'

/** Returns true when the current user has the view-only role. */
export function useReadOnly() {
  const { profile } = useAuth()
  return profile?.role === 'viewer' || profile?.role === 'stakeholder'
}
