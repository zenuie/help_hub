// src/lib/useLocalStore.ts
import React from 'react'

export function useLocalStore<T>(key: string, initial: T) {
  const [state, setState] = React.useState<T>(() => {
    try {
      const v = localStorage.getItem(key)
      return v ? JSON.parse(v) as T : initial
    } catch {
      return initial
    }
  })
  React.useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)) } catch {}
  }, [key, state])
  return [state, setState] as const
}
