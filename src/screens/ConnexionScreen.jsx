import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LogIn, UserPlus, KeyRound, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useData } from '../context/DataContext'
import { restaurerCompte, restaurerMesGroupes } from '../lib/syncEngine'
import { t, useLangue } from '../lib/i18n'
import { consentementDonne, enregistrerConsentement } from '../lib/confidentialite'
import Logo from '../components/Logo'
import Field from '../components/Field'

export default function ConnexionScreen() {
  const { utilisateur, erreur, effacerErreur, connecter, connexionEmail, inscriptionEmail, envoyerLienReset } = useAuth()
  const toast = useToast()
  const { refresh } = useData()
  const navigate = useNavigate()
  useLangue()
  const [mode, setMode] = useState('connexion') // 'connexion' | 'inscription' | 'oubli'
  const [email, setEmail] = useState('')
  const [nom, setNom] = useState('')
  const [mdp, setMdp] = useState('')
  const [mdp2, setMdp2] = useState('')
  const [localErr, setLocalErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [envoye, setEnvoye] = useState(false)
  const [accepte, setAccepte] = useState(consentementDonne)

  // Le consentement doit être recueilli avant tout traitement d'une donnée
  // personnelle (connexion, inscription ou lien Google).
  const consentir = () => {
    if (accepte) {
      enregistrerConsentement()
      return true
    }
    setLocalErr(t('confid.consentementRequis'))
    return false
  }

  const apresConnexion = async (u) => {
    if (!u) return
    const uid = u.uid || (u.user && u.user.uid)
    try {
      let total = 0
      if (uid) {
        const [nb1, nb2] = await Promise.all([restaurerCompte(uid), restaurerMesGroupes(uid)])
        total = nb1 + nb2
      }
      refresh()
      toast.success(total > 0 ? t('connexion.connecteRestaurations', { n: total }) : t('connexion.connecteBienvenue'))
    } catch {
      toast.success(t('connexion.connecteBienvenue'))
    }
    navigate('/')
  }

  const seConnecter = async () => {
    setLocalErr('')
    if (!consentir()) return
    if (!email.trim() || email.indexOf('@') === -1) {
      setLocalErr(t('connexion.emailInvalide'))
      return
    }
    if (!mdp) {
      setLocalErr(t('connexion.mdpManquant'))
      return
    }
    setBusy(true)
    try {
      const u = await connexionEmail(email.trim(), mdp)
      await apresConnexion(u)
    } finally {
      setBusy(false)
    }
  }

  const sinscrire = async () => {
    setLocalErr('')
    if (!consentir()) return
    if (!nom.trim()) {
      setLocalErr(t('connexion.nomManquant'))
      return
    }
    if (!email.trim() || email.indexOf('@') === -1) {
      setLocalErr(t('connexion.emailInvalide'))
      return
    }
    if (mdp.length < 6) {
      setLocalErr(t('connexion.mdpCourt'))
      return
    }
    if (mdp !== mdp2) {
      setLocalErr(t('connexion.mdpDifferents'))
      return
    }
    setBusy(true)
    try {
      const u = await inscriptionEmail(email.trim(), mdp, nom.trim())
      await apresConnexion(u)
    } finally {
      setBusy(false)
    }
  }

  const envoyerLien = async () => {
    setLocalErr('')
    if (!email.trim() || email.indexOf('@') === -1) {
      setLocalErr(t('connexion.emailInvalide'))
      return
    }
    setBusy(true)
    try {
      const ok = await envoyerLienReset(email.trim())
      if (ok) {
        setEnvoye(true)
        setLocalErr('')
      }
    } finally {
      setBusy(false)
    }
  }

  const changerOnglet = (id) => {
    setMode(id)
    setLocalErr('')
    if (effacerErreur) effacerErreur()
    setNom('')
  }

  const titre = mode === 'connexion' ? t('connexion.titreConnexion') : mode === 'inscription' ? t('connexion.titreInscription') : t('connexion.titreOubli')
  const sousTitre =
    mode === 'connexion'
      ? t('connexion.sousConnexion')
      : mode === 'inscription'
        ? t('connexion.sousInscription')
        : t('connexion.sousOubli')

  const submit = mode === 'connexion' ? seConnecter : mode === 'inscription' ? sinscrire : envoyerLien
  const boutonLabel = mode === 'connexion' ? t('connexion.seConnecter') : mode === 'inscription' ? t('connexion.creerCompte') : t('connexion.envoyerLien')
  const BoutonIcon = mode === 'connexion' ? LogIn : mode === 'inscription' ? UserPlus : KeyRound
  const afficherChampsMdp = mode !== 'oubli'

  return (
    <div className="app-shell relative min-h-screen overflow-hidden px-4 py-6 text-[var(--text)]">
      <div className="mx-auto max-w-md">
        <div className="mb-5 flex items-center justify-between">
          <button className="btn btn-icon" onClick={() => navigate('/')} aria-label={t('commun.retour')}>
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.55)] bg-[rgba(255,255,255,0.88)] px-3 py-2 shadow-sm backdrop-blur-sm">
            <Logo size={28} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--success)]">Tontine</span>
          </div>
          <div className="w-10" />
        </div>

        <div className="hero-wallet mb-6 rounded-[26px] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">Accès sécurisé</p>
              <h1 className="mt-2 font-serif text-2xl font-extrabold text-white">{titre}</h1>
            </div>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(201,151,63,0.12)] text-[var(--accent)]">
              <BoutonIcon size={22} />
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white/85">{sousTitre}</p>
        </div>

        <div className="rounded-[26px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[0_12px_30px_rgba(24,40,29,0.10)]">
          {mode !== 'oubli' && (
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-[var(--bg)] p-1 ring-1 ring-[var(--border)]">
              {[
                { id: 'connexion', label: t('connexion.seConnecter') },
                { id: 'inscription', label: t('connexion.sinscrire') },
              ].map((o) => (
                <button
                  key={o.id}
                  aria-pressed={mode === o.id}
                  className={`rounded-xl py-2.5 text-sm font-bold ${mode === o.id ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-sm ring-1 ring-[var(--border)]' : 'text-[var(--text-muted)]'}`}
                  onClick={() => changerOnglet(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          <Field label={t('connexion.email')}>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t('connexion.emailPlaceholder')}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setLocalErr('')
              }}
            />
          </Field>

          {mode === 'inscription' && (
            <Field label={t('connexion.nom')}>
              <input
                className="input"
                type="text"
                inputMode="text"
                autoComplete="name"
                placeholder={t('connexion.nomPlaceholder')}
                value={nom}
                onChange={(e) => {
                  setNom(e.target.value)
                  setLocalErr('')
                }}
              />
            </Field>
          )}

          {afficherChampsMdp && (
            <>
              <Field label={t('connexion.mdp')}>
                <input
                  className="input"
                  type="password"
                  autoComplete={mode === 'inscription' ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  value={mdp}
                  onChange={(e) => {
                    setMdp(e.target.value)
                    setLocalErr('')
                  }}
                />
              </Field>
              {mode === 'inscription' && (
                <Field label={t('connexion.confirmerMdp')}>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={mdp2}
                    onChange={(e) => {
                      setMdp2(e.target.value)
                      setLocalErr('')
                    }}
                  />
                </Field>
              )}
            </>
          )}

          {mode === 'connexion' && (
            <button
              className="mb-4 text-xs font-semibold text-[var(--accent)]"
              onClick={() => {
                setMode('oubli')
                setLocalErr('')
                if (effacerErreur) effacerErreur()
                setEnvoye(false)
              }}
            >
              {t('connexion.oubli')}
            </button>
          )}

          {(localErr || erreur) && (
            <p
              role="alert"
              aria-live="assertive"
              className="mb-3 rounded-2xl border border-[rgba(217,112,82,0.2)] bg-[rgba(217,112,82,0.08)] px-3 py-2 text-xs font-semibold text-[var(--error)]"
            >
              {localErr || erreur}
            </p>
          )}

          {envoye && (
            <div className="mb-3 flex items-center gap-2 rounded-2xl border border-[rgba(79,163,122,0.2)] bg-[rgba(79,163,122,0.08)] px-3 py-2 text-xs font-semibold text-[var(--success)]">
              <CheckCircle2 size={15} /> {t('connexion.lienEnvoye')}
            </div>
          )}

          {!accepte && (
            <div className="mb-4 flex min-h-11 items-start gap-2.5">
              <input
                id="consentement"
                type="checkbox"
                checked={accepte}
                onChange={(e) => setAccepte(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
              />
              <label htmlFor="consentement" className="text-[11px] leading-relaxed text-[var(--text-dim)]">
                {t('confid.case')}{' '}
                <button
                  type="button"
                  className="font-bold text-[var(--accent)] underline"
                  onClick={(e) => {
                    e.preventDefault()
                    navigate('/confidentialite')
                  }}
                >
                  {t('confid.ouvrir')}
                </button>
              </label>
            </div>
          )}

          <button className="btn btn-primary w-full" onClick={submit} disabled={busy}>
            <BoutonIcon size={16} /> {busy ? t('connexion.patientez') : boutonLabel}
          </button>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-brand-200" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{t('connexion.ou')}</span>
            <div className="h-px flex-1 bg-brand-200" />
          </div>

          {utilisateur ? (
            <p className="mt-3 text-center text-xs font-semibold text-[var(--success)]">
              {t('connexion.dejaConnecte', { email: utilisateur.email || t('connexion.compte') })}
            </p>
          ) : (
            <button
              className="btn btn-secondary mt-3 w-full"
              disabled={busy}
              onClick={async () => {
                setLocalErr('')
                if (!consentir()) return
                setBusy(true)
                try {
                  const u = await connecter()
                  await apresConnexion(u)
                } finally {
                  setBusy(false)
                }
              }}
            >
              <LogIn size={15} /> {t('connexion.seConnecterGoogle')}
            </button>
          )}

          <p className="mt-4 text-center text-[11px] text-[var(--text-muted)]">{t('connexion.footer')}</p>
        </div>
      </div>
    </div>
  )
}
