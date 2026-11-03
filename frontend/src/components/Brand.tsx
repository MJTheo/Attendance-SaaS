// The product mark: a small vermilion square + "Landas Time".
export function Brand({ size = 'md', className = '' }: { size?: 'md' | 'lg'; className?: string }) {
  const large = size === 'lg'
  return (
    <div className={`flex items-center font-bold tracking-[-0.01em] ${large ? 'gap-2 text-lg' : 'gap-1.5 text-[15px]'} ${className}`}>
      <span className={`bg-signal ${large ? 'h-[11px] w-[11px] rounded-[3px]' : 'h-[9px] w-[9px] rounded-[2px]'}`} aria-hidden="true" />
      Landas Time
    </div>
  )
}
