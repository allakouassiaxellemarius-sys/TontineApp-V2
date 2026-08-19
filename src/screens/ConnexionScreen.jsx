import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LogIn, UserPlus, KeyRound, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useData } from '../context/DataContext'
import { restaurerCompte, restaurerMesGroupes } from '../lib/syncEngine'
import { t, useLangue } from '../lib/i18n'
import Logo from '../components/Logo'
import Field from '../components/Field'

export default function ConnexionScreen() {
  const { utilisateur, erreur: authErreur, connecter, connexionEmail, inscriptionEmail, envoyerLienReset } = useAuth()
  const toast = useToast()
  const { refresh } = useData()
  const navigate = useNavigate()
  useLangue()
  const [mode, setMode] = useState('connexion') // 'connexion' | 'inscription' | 'oubli'
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [mdp2, setMdp2] = useState('')
  const [localErr, setLocalErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [envoye, setEnvoye] = useState(false)

  const apresConnexion = async (u) => {
    if (!u) return
    const [nb1, nb2] = await Promise.all([restaurerCompte(u.uid), restaurerMesGroupes(u.uid)])
    refresh()
    const total = nb1 + nb2
    toast.success(total > 0 ? t('connexion.connecteRestaurations', { n: total }) : t('connexion.connecteBienvenue'))
    navigate('/')
  }

  const seConnecter = async () => {
    setLocalErr('')
    if (!email.trim() || email.indexOf('@') === -1) {
      setLocalErr(t('connexion.emailInvalide'))
      return
    }
    if (!mdp) {
      setLocalErr(t('connexion.mdpManquant'))
      return
    }
    setBusy(true)
    const u = await connexionEmail(email.trim(), mdp)
    setBusy(false)
    await apresConnexion(u)
  }

  const sinscrire = async () => {
    setLocalErr('')
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
    const u = await inscriptionEmail(email.trim(), mdp)
    setBusy(false)
    await apresConnexion(u)
  }

  const envoyerLien = async () => {
    setLocalErr('')
    if (!email.trim() || email.indexOf('@') === -1) {
      setLocalErr(t('connexion.emailInvalide'))
      return
    }
    setBusy(true)
    const ok = await envoyerLienReset(email.trim())
    setBusy(false)
    if (ok) {
      setEnvoye(true)
      setLocalErr('')
    }
  }

  const titre = mode === 'connexion' ? t('connexion.titreConnexion') : mode === 'inscription' ? t('connexion.titreInscription') : t('connexion.titreOubli')
  const sousTitre =
    mode === 'connexion'
      ? t('connexion.sousConnexion')
      : mode === 'inscription'
        ? t('connexion.sousInscription')
        : t('connexion.sousOubli')

  const submit =
    mode === 'connexion' ? seConnecter : mode === 'inscription' ? sinscrire : envoyerLien
  const boutonLabel = mode === 'connexion' ? t('connexion.seConnecter') : mode === 'inscription' ? t('connexion.creerCompte') : t('connexion.envoyerLien')
  const BoutonIcon = mode === 'connexion' ? LogIn : mode === 'inscription' ? UserPlus : KeyRound

  const afficherChampsMdp = mode !== 'oubli'

  return (
    <div className="flex min-h-screen flex-col bg-white px-6">
      <div className="pt-safe mt-3 flex items-center justify-between">
        <button className="btn btn-icon" onClick={() => navigate('/')} aria-label={t('commun.retour')}>
          <ArrowLeft size={20} />
        </button>
        <Logo size={36} />
        <div className="w-10" />
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center pb-16">
        <h1 className="text-center text-2xl font-extrabold uppercase tracking-wide text-gray-900">{titre}</h1>
        <p className="mt-1 text-center text-sm font-semibold text-gray-400">{sousTitre}</p>

        {mode !== 'oubli' && (
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-gray-100 p-1">
            {[
              { id: 'connexion', label: t('connexion.seConnecter') },
              { id: 'inscription', label: t('connexion.sinscrire') },
            ].map((o) => (
              <button
                key={o.id}
                className={`rounded-xl py-2.5 text-sm font-bold transition ${mode === o.id ? 'bg-surface text-brand-700 shadow' : 'text-gray-400'}`}
                onClick={() => {
                  setMode(o.id)
                  setLocalErr('')
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 rounded-3xl bg-surface p-5 shadow-xl">
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
              className="mb-4 text-xs font-semibold text-brand-600"
              onClick={() => {
                setMode('oubli')
                setLocalErr('')
                setEnvoye(false)
              }}
            >
              {t('connexion.oubli')}
            </button>
          )}

          {(localErr || authErreur) && (
            <p className="mb-3 rounded-xl bg-danger-50 px-3 py-2 text-xs font-semibold text-danger-600">
              {localErr || authErreur}
            </p>
          )}

          {envoye && (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-success-50 px-3 py-2 text-xs font-semibold text-success-700">
              <CheckCircle2 size={15} /> {t('connexion.lienEnvoye')}
            </div>
          )}

          <button className="btn btn-primary w-full" onClick={submit} disabled={busy}>
            <BoutonIcon size={16} /> {busy ? t('connexion.patientez') : boutonLabel}
          </button>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('connexion.ou')}</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {utilisateur ? (
            <p className="mt-3 text-center text-xs font-semibold text-success-600">
              {t('connexion.dejaConnecte', { email: utilisateur.email || t('connexion.compte') })}
            </p>
          ) : (
            <button
              className="btn btn-secondary w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                const u = await connecter()
                setBusy(false)
                await apresConnexion(u)
              }}
            >
              <LogIn size={15} /> {t('connexion.seConnecterGoogle')}
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-gray-400">
          {t('connexion.footer')}
        </p>
      </div>
    </div>
  )
}
