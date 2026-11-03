// Shown on screens that are read-only for the shared public demo org.
export function DemoNote() {
  return (
    <div role="note" className="flex items-start gap-2.5 rounded-xl bg-status-warning-bg px-4 py-3.5 text-sm leading-normal">
      <span className="mt-[3px]">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-status-warning">
          <path d="M8 2.5l6 11H2zM8 7v3M8 12h.01" />
        </svg>
      </span>
      This is the shared demo org. Settings, rename and profile changes are read-only.
    </div>
  )
}
