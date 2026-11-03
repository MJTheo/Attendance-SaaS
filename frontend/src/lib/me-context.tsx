import { createContext, useContext, type ReactNode } from 'react'
import type { Me, Notifications } from './api'

export interface MeContextValue {
  me: Me
  notifications: Notifications | null
  // Re-read after anything that changes the counts (an approval, a filed
  // correction) or the profile itself (an approved own-name change).
  refreshNotifications: () => Promise<void>
  refreshMe: () => Promise<void>
}

const MeContext = createContext<MeContextValue | undefined>(undefined)

export function MeProvider({ value, children }: { value: MeContextValue; children: ReactNode }) {
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>
}

export function useMe(): MeContextValue {
  const ctx = useContext(MeContext)
  if (!ctx) {
    throw new Error('useMe must be used inside AppLayout')
  }
  return ctx
}
