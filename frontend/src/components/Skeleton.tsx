// In-place loading for a page's content while the shell stays put (design B:
// two surface cards with raised placeholder bars).
export function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-4">
      <div className="flex h-[180px] flex-col gap-3.5 rounded-[16px] bg-surface p-6">
        <span className="h-3.5 w-[30%] rounded-md bg-surface-raised" />
        <span className="h-10 w-[55%] rounded-[10px] bg-surface-raised" />
        <span className="h-3.5 w-[80%] rounded-md bg-surface-raised" />
      </div>
      <div className="flex h-[280px] flex-col gap-3.5 rounded-[16px] bg-surface p-6">
        <span className="h-3 w-[20%] rounded-md bg-surface-raised" />
        <span className="h-3 w-full rounded-md bg-surface-raised" />
        <span className="h-3 w-[92%] rounded-md bg-surface-raised" />
        <span className="h-3 w-[96%] rounded-md bg-surface-raised" />
        <span className="h-3 w-[70%] rounded-md bg-surface-raised" />
      </div>
    </div>
  )
}

export function LoadError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-[16px] bg-surface p-[22px] shadow-[inset_0_0_0_1.5px_var(--color-signal)]">
      <span className="text-base font-semibold">Couldn't load this page.</span>
      <span className="text-sm text-text-muted">{message ?? 'Check your connection. Everything else in the app still works.'}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="h-11 rounded-[10px] bg-action px-[18px] font-semibold text-on-action hover:opacity-90"
        >
          Try again
        </button>
      )}
    </div>
  )
}
