import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { sectionsPolitique, VERSION_POLITIQUE, consentementEnregistre, POLITIQUE_URL, SUPPRESSION_URL } from '../lib/confidentialite'
import { t, useLangue } from '../lib/i18n'
import { ouvrirLien } from '../lib/remind'

export default function ConfidentialiteScreen() {
  const navigate = useNavigate()
  useLangue()
  const sections = sectionsPolitique()
  const consentement = consentementEnregistre()
  const dateConsentement = consentement
    ? new Date(consentement.le).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 pb-10 pt-3">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          aria-label={t('commun.retour')}
          onClick={() => navigate(-1)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)]"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-[var(--text)]">{t('confid.titre')}</h1>
          <p className="text-xs text-[var(--text-muted)]">{t('confid.maj', { date: VERSION_POLITIQUE })}</p>
        </div>
      </div>

      <div className="space-y-3">
        {sections.map((s) => (
          <section key={s.titre} className="card border border-[var(--border)] bg-[var(--bg-card)]">
            <h2 className="mb-1 text-sm font-bold text-[var(--text)]">{s.titre}</h2>
            <p className="text-xs leading-relaxed text-[var(--text-dim)]">{s.texte}</p>
          </section>
        ))}
      </div>

      <div className="mt-4 grid gap-2">
        <button
          type="button"
          className="btn btn-secondary !py-2 text-xs"
          onClick={() => ouvrirLien(POLITIQUE_URL)}
        >
          {t('confid.lienPolitique')}
        </button>
        <button
          type="button"
          className="btn btn-secondary !py-2 text-xs"
          onClick={() => ouvrirLien(SUPPRESSION_URL)}
        >
          {t('confid.lienSuppression')}
        </button>
      </div>

      <p className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[var(--success)]" />
        {dateConsentement
          ? t('confid.consentementPris', { date: dateConsentement })
          : t('confid.consentementAucun')}
      </p>
    </div>
  )
}
