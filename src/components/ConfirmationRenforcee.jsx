import { useState } from 'react'
import { ShieldCheck, Fingerprint } from 'lucide-react'
import { usePin } from '../context/PinContext'
import { verifierBiometrie } from '../lib/biometrie'
import Modal from './Modal'

// Confirmation renforcée pour les actions à risque financier direct.
// Réutilise le code de déverrouillage (PIN) déjà configuré sur l'appareil de
// confiance — aucun mot technique ("2FA") visible pour l'utilisateur.
//
// Une distribution de pot, un changement de compte de collecte ou une
// suppression de groupe déplacent de l'argent réel appartenant à d'autres
// personnes. Un simple clic ne peut donc jamais suffire : sans code configuré,
// cette boîte en exige un (et le garde), sinon elle demande l'empreinte.
export default function ConfirmationRenforcee({ open, titre = 'Confirmation requise', message, onConfirmer, onFermer }) {
  const { pinActive, biometrieActive, verifierPin, activerPin } = usePin()
  const [code, setCode] = useState('')
  const [code2, setCode2] = useState('')
  const [erreur, setErreur] = useState('')
  const [verif, setVerif] = useState(false)

  const sansCode = !pinActive && !biometrieActive
  const bouton = pinActive ? 'Confirmer' : biometrieActive ? 'Vérifier l’empreinte' : 'Définir le code et continuer'

  const reset = () => { setCode(''); setCode2(''); setErreur(''); setVerif(false) }
  const fermer = () => { reset(); onFermer && onFermer() }

  const terminer = () => {
    const cb = onConfirmer
    reset()
    cb && cb()
  }

  const confirmer = async () => {
    if (verif) return

    if (pinActive) {
      if (code.length < 4) { setErreur('Code incomplet'); return }
      if (!(await verifierPin(code))) { setErreur('Code incorrect'); return }
      setVerif(true)
      onFermer && onFermer()
      terminer()
      return
    }

    if (biometrieActive) {
      setVerif(true)
      if (await verifierBiometrie()) { onFermer && onFermer(); terminer() }
      else { setVerif(false); setErreur('Vérification biométrique annulée.') }
      return
    }

    if (code.length < 4) { setErreur('Choisis un code de 4 à 6 chiffres.'); return }
    if (code !== code2) { setErreur('Les deux codes diffèrent.'); return }
    if (!(await activerPin(code))) { setErreur('Le code n’a pas pu être enregistré sur cet appareil.'); return }
    setVerif(true)
    onFermer && onFermer()
    terminer()
  }

  const saisir = (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(e.target.value); setErreur('') }
  const saisir2 = (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); setCode2(e.target.value); setErreur('') }

  return (
    <Modal
      open={open}
      onClose={fermer}
      title={titre}
      footer={
        <>
          <button className="btn btn-secondary" onClick={fermer}>Annuler</button>
          <button className="btn btn-primary" onClick={confirmer} disabled={verif}>
            {biometrieActive && !pinActive ? <Fingerprint size={16} /> : <ShieldCheck size={16} />} {bouton}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600">{message}</p>

      {pinActive && (
        <div className="mt-3">
          <label className="label">Code de confirmation</label>
          <input
            className="input text-center text-lg tracking-[0.5em]"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            spellCheck={false}
            autoFocus
            value={code}
            maxLength={6}
            placeholder="••••"
            onChange={saisir}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmer() }}
          />
          <p className="mt-1 text-[11px] text-gray-400">Saisis ton code pour valider cette action sensible.</p>
        </div>
      )}

      {!pinActive && biometrieActive && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-gray-500">
          <Fingerprint size={13} className="mt-0.5 shrink-0" />
          L'empreinte ou le visage déverrouille déjà cette application : c'est lui qui valide les actions financières.
        </p>
      )}

      {sansCode && (
        <div className="mt-3 space-y-2.5">
          <p className="rounded-xl bg-warning-50 p-2.5 text-[12px] font-semibold leading-relaxed text-warning-900 ring-1 ring-warning-200">
            Cette action déplace l'argent du groupe. Un clic ne suffit pas : choisis maintenant un code de confirmation, il servira aussi à protéger l'ouverture de l'application.
          </p>
          <div>
            <label className="label">Nouveau code (4 à 6 chiffres)</label>
            <input
              className="input text-center text-lg tracking-[0.5em]"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              spellCheck={false}
              autoFocus
              value={code}
              maxLength={6}
              placeholder="••••"
              onChange={saisir}
            />
          </div>
          <div>
            <label className="label">Retape le code</label>
            <input
              className="input text-center text-lg tracking-[0.5em]"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              spellCheck={false}
              value={code2}
              maxLength={6}
              placeholder="••••"
              onChange={saisir2}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmer() }}
            />
          </div>
        </div>
      )}

      {erreur && <p className="mt-2 text-xs font-semibold text-danger-600">{erreur}</p>}
    </Modal>
  )
}
