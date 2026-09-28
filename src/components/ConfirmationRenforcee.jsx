import { useState } from 'react'
import { ShieldCheck, Fingerprint } from 'lucide-react'
import { usePin } from '../context/PinContext'
import Modal from './Modal'

// Confirmation renforcée pour les actions à risque financier direct.
// Réutilise le code de déverrouillage (PIN) déjà configuré sur l'appareil de
// confiance — aucun mot technique ("2FA") visible pour l'utilisateur.
// Si aucun code n'est configuré, la boîte elle-même fait office de friction.
export default function ConfirmationRenforcee({ open, titre = 'Confirmation requise', message, onConfirmer, onFermer }) {
  const { pinActive, biometrieActive, verifierPin } = usePin()
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState('')
  const [verif, setVerif] = useState(false)

  const reset = () => { setCode(''); setErreur(''); setVerif(false) }
  const fermer = () => { reset(); onFermer && onFermer() }

  const confirmer = async () => {
    if (verif) return
    if (pinActive) {
      if (code.length < 4) { setErreur('Code incomplet'); return }
      const ok = await verifierPin(code)
      if (!ok) { setErreur('Code incorrect'); return }
    }
    setVerif(true)
    const cb = onConfirmer
    fermer()
    cb && cb()
  }

  return (
    <Modal
      open={open}
      onClose={fermer}
      title={titre}
      footer={
        <>
          <button className="btn btn-secondary" onClick={fermer}>Annuler</button>
          <button className="btn btn-primary" onClick={confirmer}>
            <ShieldCheck size={16} /> Confirmer
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600">{message}</p>

      {pinActive ? (
        <div className="mt-3">
          <label className="label">Code de confirmation</label>
          <input
            className="input text-center text-lg tracking-[0.5em]"
            type="password"
            inputMode="numeric"
            autoFocus
            value={code}
            maxLength={6}
            placeholder="••••"
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setErreur('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmer() }}
          />
          {erreur && <p className="mt-1 text-xs text-danger-600">{erreur}</p>}
          <p className="mt-1 text-[11px] text-gray-400">
            Saisis ton code pour valider cette action sensible.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-gray-400">
          Cette action est sensible : confirme en appuyant sur « Confirmer ».
          {biometrieActive ? ' (Déverrouillage par empreinte déjà actif sur cet appareil.)' : ''}
        </p>
      )}

      {biometrieActive && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
          <Fingerprint size={13} /> L'empreinte protège déjà l'ouverture de l'application.
        </p>
      )}
    </Modal>
  )
}
