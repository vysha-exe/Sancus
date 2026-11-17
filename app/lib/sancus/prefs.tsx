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
  setCollapsed: (value: boolean) => void
  toggleCollapsed: () => void
  setTheme: (theme: SancusTheme) => void
  ready: boolean
}

const STORAGE_KEY = "sancus.prefs"

type Stored = { collapsed?: boolean; theme?: SancusTheme }

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
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = readStored()
    if (typeof stored.collapsed === "boolean") setCollapsedState(stored.collapsed)
    if (stored.theme === "day" || stored.theme === "night") setThemeState(stored.theme)
    setReady(true)
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

  return (
    <PrefsContext.Provider
      value={{ collapsed, theme, setCollapsed, toggleCollapsed, setTheme, ready }}
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
