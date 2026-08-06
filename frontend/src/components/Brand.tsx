export function Brand({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="h-2 w-2 rounded-full bg-status-good" />
      <span className="font-mono text-xs font-semibold uppercase tracking-widest text-text-muted">
        Attendance
      </span>
    </div>
  )
}
