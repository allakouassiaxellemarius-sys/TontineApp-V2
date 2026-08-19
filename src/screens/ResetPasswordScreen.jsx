import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, KeyRound, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useData } from '../context/DataContext'
import { restaurerCompte, restaurerMesGroupes } from '../lib/syncEngine'
import { t, useLangue } from '../lib/i18n'
import Logo from '../components/Logo'
import Field from '../components/Field'

export default function ResetPasswordScreen() {
  const { confirmerReset } = useAuth()
  const toast = useToast()
  const { refresh } = useData()
  const navigate = useNavigate()
  useLangue()
  const [params] = useSearchParams()
  const email = params.get('email') || ''
  const token = params.get('token') || ''
  const [mdp, setMdp] = useState('')
  const [mdp2, setMdp2] = useState('')
  const [localErr, setLocalErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [fait, setFait] = useState(false)

  const apresReset = async (u) => {
    if (!u) return
    await Promise.all([restaurerCompte(u.uid), restaurerMesGroupes(u.uid)])
    refresh()
    toast.success(t('reset.reussite'))
    navigate('/')
  }

  const soumettre = async () => {
    setLocalErr('')
    if (!email || !token) {
      setLocalErr(t('reset.lienInvalide'))
      return
    }
    if (mdp.length < 6) {
      setLocalErr(t('reset.mdpCourt'))
      return
    }
    if (mdp !== mdp2) {
      setLocalErr(t('reset.mdpDifferents'))
      return
    }
    setBusy(true)
    const u = await confirmerReset(email, token, mdp)
    setBusy(false)
    if (u) {
      setFait(true)
      await apresReset(u)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-500 to-brand-700 px-6">
      <div className="pt-safe mt-3 flex items-center justify-between">
        <button className="btn btn-icon bg-surface/10 text-white backdrop-blur" onClick={() => navigate('/connexion')} aria-label={t('commun.retour')}>
          <ArrowLeft size={20} />
        </button>
        <Logo size={36} className="opacity-90" />
        <div className="w-10" />
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center pb-16">
        <h1 className="text-center text-2xl font-extrabold uppercase tracking-wide text-white">{t('reset.titre')}</h1>
        <p className="mt-1 text-center text-sm font-semibold text-brand-100">{t('reset.sousTitre')}</p>

        <div className="mt-6 rounded-3xl bg-surface p-5 shadow-xl">
          {email ? (
            <p className="mb-3 text-center text-xs font-semibold text-gray-500">{email}</p>
          ) : null}

          <Field label={t('reset.nouveauMdp')}>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={mdp}
              onChange={(e) => { setMdp(e.target.value); setLocalErr('') }}
            />
          </Field>

          <Field label={t('reset.confirmerMdp')}>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={mdp2}
              onChange={(e) => { setMdp2(e.target.value); setLocalErr('') }}
            />
          </Field>

          {localErr && (
            <p className="mb-3 rounded-xl bg-danger-50 px-3 py-2 text-xs font-semibold text-danger-600">{localErr}</p>
          )}

          {fait && (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-success-50 px-3 py-2 text-xs font-semibold text-success-700">
              <CheckCircle2 size={15} /> {t('reset.reussite')}
            </div>
          )}

          <button className="btn btn-primary w-full" onClick={soumettre} disabled={busy}>
            <KeyRound size={16} /> {busy ? t('reset.patientez') : t('reset.valider')}
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-brand-100">{t('connexion.footer')}</p>
      </div>
    </div>
  )
}
