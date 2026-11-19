"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

export type SancusTheme = "day" | "night"

type Prefs = {
  collapsed: boolean
  theme: SancusTheme
  debugMode: boolean
  setCollapsed: (value: boolean) => void
  toggleCollapsed: () => void
  setTheme: (theme: SancusTheme) => void
  setDebugMode: (value: boolean) => void
  ready: boolean
}

const STORAGE_KEY = "sancus.prefs"

type Stored = { collapsed?: boolean; theme?: SancusTheme; debugMode?: boolean }

const PrefsContext = createContext<Prefs | null>(null)

function readStored(): Stored {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Stored
  } catch {
    return {}
  }
}

function writeStored(next: Stored) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
}

export function SancusPrefsProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false)
  const [theme, setThemeState] = useState<SancusTheme>("day")
  const [debugMode, setDebugModeState] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = readStored()
    /* eslint-disable react-hooks/set-state-in-effect -- Preferences hydrate after mount to avoid server/client markup mismatches. */
    if (typeof stored.collapsed === "boolean") setCollapsedState(stored.collapsed)
    if (stored.theme === "day" || stored.theme === "night") setThemeState(stored.theme)
    if (typeof stored.debugMode === "boolean") setDebugModeState(stored.debugMode)
    setReady(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value)
    writeStored({ ...readStored(), collapsed: value })
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev
      writeStored({ ...readStored(), collapsed: next })
      return next
    })
  }, [])

  const setTheme = useCallback((next: SancusTheme) => {
    setThemeState(next)
    writeStored({ ...readStored(), theme: next })
  }, [])

  const setDebugMode = useCallback((value: boolean) => {
    setDebugModeState(value)
    writeStored({ ...readStored(), debugMode: value })
  }, [])

  return (
    <PrefsContext.Provider
      value={{ collapsed, theme, debugMode, setCollapsed, toggleCollapsed, setTheme, setDebugMode, ready }}
    >
      {children}
    </PrefsContext.Provider>
  )
}

export function useSancusPrefs(): Prefs {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error("useSancusPrefs must be used within SancusPrefsProvider")
  return ctx
}
