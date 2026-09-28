export default function ActionRow({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 rounded-xl bg-[rgba(201,151,63,0.04)] px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text)]">
          {Icon && <Icon size={14} />} {title}
        </p>
        <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {children}
      </div>
    </div>
  )
}
