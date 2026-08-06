import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8">
        <h1 className="mb-6 font-sans text-xl font-semibold text-text">{title}</h1>
        {children}
      </div>
    </div>
  )
}

export function FormField({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-text outline-none focus:border-status-good"
      />
    </label>
  )
}

export function SubmitButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      type="submit"
      className="w-full rounded-md bg-status-good px-3 py-2 font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {children}
    </button>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="mb-4 font-mono text-sm text-status-warning">{children}</p>
}
