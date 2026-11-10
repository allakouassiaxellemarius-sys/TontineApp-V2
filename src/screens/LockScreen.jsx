import { useState, useEffect } from 'react'
import { Delete, Check, ArrowRight, Fingerprint } from 'lucide-react'
import { usePin } from '../context/PinContext'
import { isValidPin } from '../lib/pin'
import { biometrieDisponible, verifierBiometrie } from '../lib/biometrie'
import { t, useLangue } from '../lib/i18n'
import Logo from '../components/Logo'

function Puncts({ value, length }) {
  return (
    <div className="flex gap-3">
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={`h-4 w-4 rounded-full border-2 ${
            i < value.length ? 'border-brand-600 bg-brand-600' : 'border-gray-300 bg-transparent'
          }`}
        />
      ))}
    </div>
  )
}

export default function LockScreen() {
  const { pinActive, totpActive, biometrieActive, activerPin, verifierPin, verifierTotp, passer } = usePin()
  const [stage, setStage] = useState('pin') // 'pin' | 'totp'
  const [confirmPhase, setConfirmPhase] = useState(false)
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [biometrieBusy, setBiometrieBusy] = useState(false)
  const [typeNom, setTypeNom] = useState(t('lock.typeEmpreinte'))
  useLangue()

  useEffect(() => {
    if (!pinActive || !biometrieActive) return
    let actif = true
    biometrieDisponible().then((res) => {
      if (actif && res.typeNom) setTypeNom(res.typeNom)
    })
    return () => { actif = false }
  }, [pinActive, biometrieActive])

  const MAX = 6
  const inConfirm = confirmPhase && !pinActive
  const inTotp = stage === 'totp'
  const code = inConfirm ? pinConfirm : pin

  const press = (digit) => {
    setError('')
    if (inTotp) setPin((p) => (p.length >= MAX ? p : p + digit))
    else if (inConfirm) setPinConfirm((p) => (p.length >= MAX ? p : p + digit))
    else setPin((p) => (p.length >= MAX ? p : p + digit))
  }

  const backspace = () => {
    if (inTotp) setPin((p) => p.slice(0, -1))
    else if (inConfirm) setPinConfirm((p) => p.slice(0, -1))
    else setPin((p) => p.slice(0, -1))
  }

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (inTotp) {
        const ok = await verifierTotp(pin)
        if (!ok) {
          setError(t('lock.codeInvalide'))
          setPin('')
        }
      } else if (pinActive) {
        const ok = await verifierPin(pin)
        if (ok && totpActive) {
          setStage('totp')
          setPin('')
        } else if (!ok) {
          setError(t('lock.pinIncorrect'))
          setPin('')
        }
      } else if (!confirmPhase) {
        if (!isValidPin(pin)) setError(t('lock.pinInvalide'))
        else setConfirmPhase(true)
      } else {
        if (pin !== pinConfirm) {
          setError(t('lock.pinDifferents'))
          setPinConfirm('')
        } else {
          await activerPin(pin)
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const skip = () => {
    setSkipped(true)
    passer()
  }

  const deverrouillerBiometrie = async () => {
    if (biometrieBusy) return
    setBiometrieBusy(true)
    setError('')
    const ok = await verifierBiometrie()
    setBiometrieBusy(false)
    if (ok) passer()
    else setError(t('lock.biometrieRefusee'))
  }

  const shown = skipped ? null : (pinActive ? 'unlock' : 'create')
  const autoUnlock = pinActive && !inConfirm && pin.length >= (inTotp ? 6 : 4)

  if (!shown) return null

  const titre = inTotp
    ? t('lock.titreTotp')
    : pinActive
      ? t('lock.titreEntrer')
      : inConfirm
        ? t('lock.titreConfirmer')
        : t('lock.titreCreer')

  return (
    // Fond et textes fixés sur la charte : les rampes sémantiques s'inversent
    // en mode sombre et le blanc de cet écran y perdrait sa lisibilité.
    <div className="flex min-h-screen flex-col items-center justify-center gradient-primary px-6">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-surface shadow-[0_4px_0_rgba(13,122,80,0.35)]">
        <Logo size={52} />
      </div>
      <h1 className="text-2xl font-extrabold uppercase tracking-wide text-white">Tontine Manager</h1>
      <p className="mt-1 text-sm font-bold text-[#D9F6E6]">{titre}</p>

      <div className="mt-8">
        <Puncts value={code.length} length={pinActive ? (inTotp ? 6 : 4) : MAX} />
      </div>

      <p className="mt-4 h-5 text-sm text-[#FFB4AB]">{error}</p>

      <div className="mt-2 grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            className="h-16 w-16 rounded-2xl bg-surface/10 text-xl font-semibold text-white backdrop-blur active:bg-surface/20"
            onClick={() => press(String(n))}
          >
            {n}
          </button>
        ))}
        <div className="h-16 w-16" />
        <button
          className="h-16 w-16 rounded-2xl bg-surface text-xl font-semibold text-brand-700 shadow-lg"
          onClick={() => press('0')}
        >
          0
        </button>
        <button className="h-16 w-16 rounded-2xl text-white" onClick={backspace}>
          <Delete className="mx-auto" size={26} />
        </button>
      </div>

      {(inConfirm || (autoUnlock && !busy)) && (
        <button className="btn mt-6 bg-surface text-brand-700 hover:bg-brand-50" onClick={submit} disabled={busy}>
          <Check size={18} /> {inConfirm ? t('commun.confirmer') : inTotp ? t('commun.valider') : t('lock.deverrouiller')}
        </button>
      )}
      {!pinActive && !inConfirm && pin.length >= 4 && (
        <button className="btn mt-6 bg-surface text-brand-700 hover:bg-brand-50" onClick={submit} disabled={busy}>
          <ArrowRight size={18} /> {t('commun.continuer')}
        </button>
      )}
      {!pinActive && !inConfirm && pin.length === 0 && (
        <button className="btn mt-6 bg-transparent text-brand-100 hover:bg-surface/10" onClick={skip}>
          {t('lock.passer')}
        </button>
      )}
      {pinActive && biometrieActive && !inTotp && (
        <button className="btn mt-4 bg-transparent text-brand-100 hover:bg-surface/10" onClick={deverrouillerBiometrie} disabled={biometrieBusy}>
          <Fingerprint size={18} /> {biometrieBusy ? t('lock.verification') : t('lock.deverrouillerAvec', { type: typeNom })}
        </button>
      )}
    </div>
  )
}
