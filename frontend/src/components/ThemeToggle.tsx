import { useTheme } from '../lib/theme'

// Icon-only theme switch (sign-in screens, mobile top bar).
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle, icon } = useTheme()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-text-muted hover:text-text ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={icon} />
      </svg>
    </button>
  )
}
