import { useEffect, useState } from 'react'
import { readGuestModeSession, subscribeToGuestModeChanges } from '../lib/guestMode'

export function useGuestModeSession() {
  const [session, setSession] = useState(() => readGuestModeSession())

  useEffect(() => subscribeToGuestModeChanges(() => {
    setSession(readGuestModeSession())
  }), [])

  return session
}
