export default function Avatar({ src, nom = '', size = 44, className = '', onClick, title }) {
  const initials = (nom || '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
  const style = { width: size, height: size }

  if (src) {
    return (
      <img
        src={src}
        alt={nom}
        title={title}
        onClick={onClick}
        style={style}
        className={`rounded-full object-cover ${className}`}
      />
    )
  }
  return (
    <div
      title={title}
      onClick={onClick}
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 ${className}`}
    >
      <span style={{ fontSize: Math.max(12, Math.round(size * 0.4)) }}>{initials}</span>
    </div>
  )
}
