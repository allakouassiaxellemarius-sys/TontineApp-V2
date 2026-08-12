export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="relative mb-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-100 text-brand-700 animate-bounce-soft">
          {Icon && <Icon size={38} strokeWidth={1.8} />}
        </div>
        <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-warning-300 text-xs animate-bounce-soft" style={{ animationDelay: '0.15s' }} aria-hidden="true">
          ✦
        </span>
      </div>
      <h3 className="text-lg font-extrabold text-gray-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-xs text-sm font-medium leading-relaxed text-gray-600">{description}</p>}
      {action && <div className="mt-6 w-full max-w-xs">{action}</div>}
    </div>
  )
}
