import { useRef, type ButtonHTMLAttributes, type ClipboardEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import { Brand } from '../components/Brand'
import { ThemeToggle } from '../components/ThemeToggle'

// Sign in / sign up / onboarding / accept invite (design B): a graphite side
// panel on desktop that previews the product, and the form on the right.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap text-[15px] leading-[1.45]">
      <aside aria-hidden="true" className="hidden flex-[1_1_420px] flex-col justify-between gap-10 bg-panel px-12 py-10 text-panel-text md:flex">
        <Brand size="lg" />
        <div className="flex max-w-[460px] flex-col gap-[22px]">
          <div className="flex flex-col gap-2">
            <div className="relative h-[34px] overflow-hidden rounded-[10px] bg-panel-track">
              <div className="absolute inset-y-0 left-[18.5%] w-[56.9%] border-x-2 border-panel-good bg-panel-good/20" />
            </div>
            <div className="flex justify-between font-mono text-[11px] text-panel-muted">
              <span>06:00</span>
              <span>14:00</span>
              <span>22:00</span>
            </div>
          </div>
          <div className="font-mono text-[40px] leading-none tracking-[-0.03em]">
            08:58 <span className="text-panel-muted">→</span> 18:04
          </div>
          <p className="m-0 text-base leading-[1.55] text-panel-muted">Clock in, clock out, and see your team's week at a glance.</p>
        </div>
        <div className="font-mono text-xs text-panel-muted">Every org runs on its own timezone.</div>
      </aside>

      <main className="flex min-w-0 flex-[1_1_520px] flex-col gap-6 px-4 pb-8 pt-4 md:px-12 md:pb-12 md:pt-7">
        <div className="flex items-center justify-between gap-3">
          <Brand className="!text-[17px] md:invisible" />
          <ThemeToggle className="bg-surface" />
        </div>
        <div className="flex flex-1 items-start justify-center md:items-center">
          <div className="flex w-full max-w-[420px] flex-col gap-[22px]">{children}</div>
        </div>
      </main>
    </div>
  )
}

export function AuthHeading({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="m-0 text-[30px] font-semibold leading-[1.15] tracking-[-0.02em]">{title}</h1>
      {sub && <span className="text-text-muted">{sub}</span>}
    </div>
  )
}

const INPUT =
  'h-[50px] w-full rounded-[10px] border bg-surface px-3.5 text-text outline-none focus:border-text aria-[invalid=true]:border-[1.5px] aria-[invalid=true]:border-signal border-border'

export function FormField({
  label,
  hint,
  mono = false,
  ...props
}: { label: string; hint?: string; mono?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-text-muted">{label}</span>
      <input {...props} className={`${INPUT} ${mono ? 'font-mono text-sm' : ''}`} />
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </label>
  )
}

export function SubmitButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      type="submit"
      className="h-[52px] w-full rounded-xl bg-action text-base font-semibold text-on-action transition-opacity hover:opacity-90 disabled:cursor-progress disabled:opacity-65"
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-xl bg-surface-raised text-text hover:opacity-90 disabled:cursor-progress disabled:opacity-65 ${className}`}
    >
      {children}
    </button>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-signal-soft px-3.5 py-3 text-sm">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-error">
        <path d="M8 2.5l6 11H2zM8 7v3M8 12h.01" />
      </svg>
      <span>{children}</span>
    </div>
  )
}

export function TextLink({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} className="px-0.5 py-2.5 font-semibold text-text underline">
      {children}
    </button>
  )
}

// The 6-digit access code from the org-signup authenticator, one box per
// digit: typing moves forward, Backspace moves back, a pasted code fills all.
export function CodeInput({
  label,
  value,
  onChange,
  invalid = false,
  help,
}: {
  label: string
  value: string
  onChange: (code: string) => void
  invalid?: boolean
  help: ReactNode
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '')

  function setDigit(index: number, digit: string) {
    const next = digits.slice()
    next[index] = digit
    onChange(next.join('').slice(0, 6))
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      setDigit(index - 1, '')
      refs.current[index - 1]?.focus()
      event.preventDefault()
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    event.preventDefault()
    onChange(pasted)
    refs.current[Math.min(pasted.length, 5)]?.focus()
  }

  return (
    <div className="flex flex-col gap-2">
      <span id="access-code-label" className="text-[13px] text-text-muted">
        {label}
      </span>
      <div role="group" aria-labelledby="access-code-label" className="grid max-w-[360px] grid-cols-6 gap-2">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            aria-label={`Digit ${i + 1}`}
            aria-invalid={invalid}
            value={digit}
            onPaste={handlePaste}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, '').slice(-1)
              setDigit(i, d)
              if (d && i < 5) refs.current[i + 1]?.focus()
            }}
            className={`${INPUT} h-14 min-w-0 px-0 text-center font-mono text-[22px]`}
          />
        ))}
      </div>
      {invalid ? (
        <span role="alert" className="text-[13px] text-error">
          That code didn't match. Codes refresh every 30 seconds, so use the one on screen now.
        </span>
      ) : (
        <span className="text-[13px] text-text-muted">{help}</span>
      )}
    </div>
  )
}
