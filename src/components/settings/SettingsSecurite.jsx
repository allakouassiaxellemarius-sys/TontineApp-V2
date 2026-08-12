import { useState, useEffect } from 'react'
import { ShieldCheck, Lock, Unlock, RefreshCw, KeyRound, ScanLine, Fingerprint } from 'lucide-react'
import { usePin } from '../../context/PinContext'
import { biometrieDisponible } from '../../lib/biometrie'
import QRCode from 'qrcode'
import { uriTotp } from '../../lib/totp'
import SectionCard from './SectionCard'
import ActionRow from './ActionRow'
import Modal from '../Modal'
import Field from '../Field'

export default function SettingsSecurite({ enLigne, refresh }) {
  const { pinActive, totpActive, biometrieActive, activerPin, desactiverPin, changerPin, verrouiller, preparerTotp, activerTotp, desactiverTotp, activerBiometrie, desactiverBiometrie } = usePin()
  const [pinModal, setPinModal] = useState(null) // 'activer' | 'desactiver' | 'changer'
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [totpModal, setTotpModal] = useState(null) // 'activer' | 'desactiver'
  const [totpSecret, setTotpSecret] = useState('')
  const [totpQr, setTotpQr] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpError, setTotpError] = useState('')
  const [biometrie, setBiometrie] = useState({ disponible: false, typeNom: '' })

  useEffect(() => {
    let actif = true
    biometrieDisponible().then((res) => {
      if (actif) setBiometrie(res)
    })
    return () => { actif = false }
  }, [])

  const submitPin = async () => {
    if (!enLigne) return
    if (pinModal === 'activer') {
      if (pin1.length < 4) return
      if (pin1 !== pin2) return
      await activerPin(pin1)
    }
    if (pinModal === 'changer') {
      if (pin2.length < 4) return
      const ok = await changerPin(pin1, pin2)
      if (!ok) return
    }
    if (pinModal === 'desactiver') {
      const ok = await desactiverPin(pin1)
      if (!ok) return
    }
    setPinModal(null)
    setPin1('')
    setPin2('')
    refresh()
  }

  const ouvrirTotp = async (mode) => {
    setTotpCode('')
    setTotpError('')
    if (mode === 'activer') {
      const secret = preparerTotp()
      setTotpSecret(secret)
      const uri = uriTotp(secret, 'appareil-tontine')
      const qr = await QRCode.toDataURL(uri, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
      setTotpQr(qr)
    }
    setTotpModal(mode)
  }

  const submitTotp = async () => {
    if (totpCode.length !== 6) return
    let ok = false
    if (totpModal === 'activer') ok = await activerTotp(totpCode)
    else ok = await desactiverTotp(totpCode)
    if (!ok) {
      setTotpError("Code incorrect — vérifiez votre application d'authentification")
      return
    }
    setTotpModal(null)
    setTotpCode('')
    refresh()
  }

  return (
    <SectionCard icon={ShieldCheck} title="Sécurité">
      <ActionRow
        title="Code PIN"
        subtitle={pinActive ? "Actif — l'app est verrouillée au démarrage" : "Inactif — l'app n'est pas protégée"}
      >
        {!pinActive ? (
          <button className="btn btn-primary !py-2" onClick={() => { setPinModal('activer'); setPin1(''); setPin2(''); }}>
            <Lock size={15} /> Activer
          </button>
        ) : (
          <div className="flex gap-2">
            <button className="btn btn-secondary !py-2 text-xs" onClick={() => { setPinModal('changer'); setPin1(''); setPin2(''); }}>
              <RefreshCw size={14} /> Changer
            </button>
            <button className="btn btn-secondary !py-2 text-xs" onClick={() => { setPinModal('desactiver'); setPin1(''); }}>
              <Unlock size={14} /> Désactiver
            </button>
          </div>
        )}
      </ActionRow>

      <ActionRow
        title="Double authentification (2FA)"
        subtitle={
          !pinActive
            ? 'Activez d\'abord le code PIN ci-dessus'
            : totpActive
              ? "Active — le PIN doit être suivi d'un code à 6 chiffres"
              : "Inactive — protège le déverrouillage par code temporaire"
        }
      >
        {!pinActive ? (
          <span className="text-xs text-secondary">Requiert le PIN</span>
        ) : !totpActive ? (
          <button className="btn btn-primary !py-2" onClick={() => ouvrirTotp('activer')}>
            <ScanLine size={15} /> Activer
          </button>
        ) : (
          <button className="btn btn-secondary !py-2 text-xs" onClick={() => ouvrirTotp('desactiver')}>
            <KeyRound size={14} /> Désactiver
          </button>
        )}
      </ActionRow>

      <ActionRow
        title="Déverrouillage biométrique"
        subtitle={
          !pinActive
            ? 'Requiert le code PIN'
            : !biometrie.disponible
              ? 'Non disponible sur cet appareil'
              : biometrieActive
                ? `Active — déverrouillez avec ${biometrie.typeNom}`
                : `Inactive — déverrouillez avec ${biometrie.typeNom}`
        }
      >
        {!pinActive ? (
          <span className="text-xs text-secondary">Requiert le PIN</span>
        ) : !biometrie.disponible ? (
          <span className="text-xs text-secondary">Indisponible</span>
        ) : biometrieActive ? (
          <button className="btn btn-secondary !py-2 text-xs" onClick={desactiverBiometrie}>
            <KeyRound size={14} /> Désactiver
          </button>
        ) : (
          <button className="btn btn-primary !py-2" onClick={activerBiometrie}>
            <Fingerprint size={15} /> Activer
          </button>
        )}
      </ActionRow>

      <button className="btn btn-ghost mt-2 w-full justify-start text-sm" onClick={verrouiller}>
        <Lock size={15} /> Verrouiller maintenant
      </button>

      <Modal
        open={!!pinModal}
        onClose={() => setPinModal(null)}
        title={pinModal === 'activer' ? 'Activer le code PIN' : pinModal === 'changer' ? 'Changer le code PIN' : 'Désactiver le code PIN'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPinModal(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={submitPin} disabled={pin1.length < 4}>
              Confirmer
            </button>
          </>
        }
      >
        <Field label={pinModal === 'activer' ? 'Nouveau code (4-6 chiffres)' : 'Code actuel'}>
          <input className="input" type="password" inputMode="numeric" value={pin1} onChange={(e) => setPin1(e.target.value)} placeholder="••••" />
        </Field>
        {pinModal !== 'desactiver' && (
          <Field label={pinModal === 'changer' ? 'Nouveau code (4-6 chiffres)' : 'Confirmer le code'}>
            <input className="input" type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value)} placeholder="••••" />
          </Field>
        )}
      </Modal>

      <Modal
        open={!!totpModal}
        onClose={() => setTotpModal(null)}
        title={totpModal === 'activer' ? 'Activer la double authentification' : 'Désactiver la double authentification'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setTotpModal(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={submitTotp} disabled={totpCode.length !== 6}>
              Confirmer
            </button>
          </>
        }
      >
        {totpModal === 'activer' && (
          <>
            <p className="mb-2 text-sm text-secondary">
              Scannez ce code avec <strong>Google Authenticator</strong> ou une application compatible (Authy, 1Password, etc.), puis saisissez le code à 6 chiffres affiché pour confirmer.
            </p>
            {totpQr && <img src={totpQr} alt="QR code 2FA" className="mx-auto mb-2 h-48 w-48 rounded-lg bg-white p-2" />}
            <p className="mb-3 break-all rounded-lg bg-surface p-2 text-center font-mono text-xs text-secondary">{totpSecret}</p>
            <Field label="Code à 6 chiffres">
              <input
                className="input"
                inputMode="numeric"
                value={totpCode}
                onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setTotpError('') }}
                placeholder="000000"
              />
            </Field>
            {totpError && <p className="mt-1 text-sm text-danger-500">{totpError}</p>}
          </>
        )}
        {totpModal === 'desactiver' && (
          <>
            <p className="mb-2 text-sm text-secondary">Saisissez le code actuellement affiché dans votre application pour désactiver la 2FA.</p>
            <Field label="Code à 6 chiffres">
              <input
                className="input"
                inputMode="numeric"
                value={totpCode}
                onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setTotpError('') }}
                placeholder="000000"
              />
            </Field>
            {totpError && <p className="mt-1 text-sm text-danger-500">{totpError}</p>}
          </>
        )}
      </Modal>
    </SectionCard>
  )
}