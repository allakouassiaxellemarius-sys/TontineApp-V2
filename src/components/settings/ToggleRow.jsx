import ActionRow from './ActionRow'

export default function ToggleRow({ icon, title, subtitle, checked, onChange }) {
  return (
    <ActionRow icon={icon} title={title} subtitle={subtitle}>
      <button
        type="button"
        aria-pressed={checked}
        onClick={onChange}
        className={`relative h-6 w-11 shrink-0 rounded-full ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--bg-card)] shadow ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </ActionRow>
  )
}
