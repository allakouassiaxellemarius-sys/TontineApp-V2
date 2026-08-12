export default function ActionRow({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 rounded-xl bg-gray-50 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          {Icon && <Icon size={14} />} {title}
        </p>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {children}
      </div>
    </div>
  )
}
