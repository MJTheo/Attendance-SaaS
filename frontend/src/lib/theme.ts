import { useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'attendance-theme'

// Light is the default (design direction B); dark is opt-in and remembered
// per browser. Must stay in sync with index.html's no-flash script.
export function getStoredTheme(): Theme {
  return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  localStorage.setItem(STORAGE_KEY, theme)
}

const THEME_ICON = {
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
}

// Current theme + a toggle; the icon shows the theme you'd switch to.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())
  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }
  return { theme, toggle, icon: theme === 'dark' ? THEME_ICON.sun : THEME_ICON.moon }
}
