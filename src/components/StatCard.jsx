export default function StatCard({ icon: Icon, label, value, sub, color = 'text-brand-600 bg-brand-50' }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
        {Icon && (
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  )
}
