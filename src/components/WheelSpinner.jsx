import { useState } from 'react'
import { Dices, Trophy, RotateCcw } from 'lucide-react'

const COULEURS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

function positionLabel(i) {
  return i === 0 ? '1er' : `${i + 1}e`
}

export default function WheelSpinner({ membres, ordre = [], onDraw }) {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [localOrdre, setLocalOrdre] = useState([])

  const actifs = membres.filter((m) => !m.bloque)
  const n = actifs.length
  if (n < 2) return null

  const size = 260
  const center = size / 2
  const radius = 118
  const seg = 360 / n

  const point = (angleDeg, r) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180
    return { x: center + r * Math.cos(rad), y: center + r * Math.sin(rad) }
  }

  const segments = actifs.map((m, i) => {
    const a1 = i * seg
    const a2 = (i + 1) * seg
    const p1 = point(a1, radius)
    const p2 = point(a2, radius)
    const largeArc = a2 - a1 > 180 ? 1 : 0
    const labelAngle = a1 + seg / 2
    return {
      m,
      p1,
      p2,
      largeArc,
      labelAngle,
      lp: point(labelAngle, radius * 0.62),
      color: COULEURS[i % COULEURS.length],
    }
  })

  const ordreIds = (localOrdre.length ? localOrdre : ordre).map((id) => Number(id))
  const classement = (() => {
    const ordonnes = ordreIds
      .map((id) => actifs.find((m) => m.id === id))
      .filter(Boolean)
    const deja = new Set(ordonnes.map((m) => m.id))
    const reste = actifs.filter((m) => !deja.has(m.id))
    return [...ordonnes, ...reste]
  })()
  const aEteTire = ordreIds.length > 0

  const spin = () => {
    if (spinning) return
    setSpinning(true)
    const idx = Math.floor(Math.random() * n)
    const base = (idx * seg + seg / 2) % 360
    const extra = (360 - (rotation % 360) + base) % 360
    setRotation(rotation + 360 * 6 + extra)
    const nouvelOrdre = Array.from({ length: n }, (_, k) => actifs[(idx + k) % n].id)
    setTimeout(() => {
      setLocalOrdre(nouvelOrdre)
      onDraw?.(nouvelOrdre)
      setSpinning(false)
    }, 4200)
  }

  return (
    <div className="card mb-4 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Dices size={16} className="text-brand-600" />
        <p className="text-sm font-bold text-gray-700">Ordre de passage (tiré au sort)</p>
      </div>
      <div className="relative mx-auto" style={{ width: size }}>
        <div className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 text-2xl leading-none text-brand-600">
          ▼
        </div>
        <div
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? 'transform 4.2s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
          }}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {segments.map((s, i) => (
              <path
                key={i}
                d={`M ${center} ${center} L ${s.p1.x} ${s.p1.y} A ${radius} ${radius} 0 ${s.largeArc} 1 ${s.p2.x} ${s.p2.y} Z`}
                fill={s.color}
                stroke="white"
                strokeWidth="2"
              />
            ))}
            {segments.map((s, i) => (
              <text
                key={i}
                x={s.lp.x}
                y={s.lp.y}
                transform={`rotate(${s.labelAngle} ${s.lp.x} ${s.lp.y})`}
                fill="white"
                fontSize="12"
                fontWeight="bold"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {s.m.nom.length > 10 ? s.m.nom.slice(0, 9) + '…' : s.m.nom}
              </text>
            ))}
            <circle cx={center} cy={center} r={26} fill="white" />
            <circle cx={center} cy={center} r={26} fill="none" stroke="#e5e7eb" />
          </svg>
        </div>
      </div>
      <button className="btn btn-primary mt-4 w-full" onClick={spin} disabled={spinning}>
        <Dices size={16} /> {spinning ? 'La roue tourne…' : aEteTire ? 'Tirer un nouvel ordre' : 'Tourner la roue'}
      </button>

      {aEteTire && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <Trophy size={15} className="text-warning-500" />
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Classement ({n} membres)</p>
          </div>
          <ol className="space-y-1.5">
            {classement.map((m, i) => (
              <li
                key={m.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                  i === 0 ? 'border border-brand-200 bg-brand-50' : 'bg-gray-50'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                    i === 0 ? 'bg-brand-600 text-white' : 'bg-surface text-gray-600'
                  }`}
                >
                  {positionLabel(i)}
                </span>
                <p className={`truncate text-sm font-semibold ${i === 0 ? 'text-brand-800' : 'text-gray-700'}`}>
                  {m.nom}
                </p>
                {i === 0 && (
                  <span className="badge ml-auto bg-brand-600 text-white">
                    <RotateCcw size={11} /> Passe en premier
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
