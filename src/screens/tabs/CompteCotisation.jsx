import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Wallet } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getReference } from '../../lib/cotisation'
import { formatMontant } from '../../lib/format'
import { syncDisponible } from '../../lib/cloudApi'

export default function CompteCotisation({ group }) {
  const { utilisateur } = useAuth()
  const toast = useToast()
  const code = group.codeUnique
  const uid = utilisateur ? utilisateur.uid : null

  const [reference, setReference] = useState('')
  const [qr, setQr] = useState('')

  // Référence unique du membre (pour la narration du virement).
  useEffect(() => {
    let annule = false
    if (code && uid) {
      getReference(code)
        .then((r) => !annule && setReference(r || ''))
        .catch(() => {})
    }
    return () => { annule = true }
  }, [code, uid])

  // Compte bancaire manuel (zéro KYC) saisi par le responsable.
  const compteManuel = group.banque
    ? { bankName: group.banque.nom, accountNumber: group.banque.compte, accountName: group.banque.titulaire, manuel: true }
    : null

  // QR code regroupant les infos de virement.
  useEffect(() => {
    if (!compteManuel || !compteManuel.accountNumber) { setQr(''); return }
    const texte = [
      'TONTINE ' + (group.nom || ''),
      'BANQUE: ' + (compteManuel.bankName || ''),
      'COMPTE: ' + compteManuel.accountNumber,
      'NOM: ' + (compteManuel.accountName || ''),
      reference ? 'REFERENCE: ' + reference : '',
    ].filter(Boolean).join('\n')
    QRCode.toDataURL(texte, { width: 240, margin: 1 }).then(setQr).catch(() => setQr(''))
  }, [compteManuel, reference, group.nom])

  const copier = async (val, lib) => {
    try {
      await navigator.clipboard.writeText(String(val))
      toast.success((lib || 'Copié') + ' copié')
    } catch {
      toast.error('Copie impossible')
    }
  }

  if (!code) return null

  if (!syncDisponible()) {
    return (
      <div className="card mb-4 p-4 text-sm text-gray-500">
        La synchronisation cloud doit être configurée pour utiliser le compte de cotisation.
      </div>
    )
  }

  if (!compteManuel) {
    return (
      <div className="card mb-4 p-4 text-sm text-gray-500">
        Aucun compte configuré pour ce groupe. Le responsable peut ajouter les coordonnées bancaires dans l’onglet Trésorerie (virement manuel).
      </div>
    )
  }

  return (
    <div className="card mb-4 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Wallet size={16} className="text-brand-600" />
        <p className="text-sm font-bold text-gray-800">Compte de cotisation (virement)</p>
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">MANUEL</span>
      </div>
      <p className="text-xs text-gray-500">
        Virez <span className="font-semibold text-gray-700">{formatMontant(group.montantCotisation, group)}</span> sur ce compte
        et indiquez <span className="font-semibold text-gray-700">votre référence</span> dans le libellé du virement.
        Signalez ensuite le paiement dans l’onglet Paiements (J’ai payé).
      </p>

      <div className="mt-3 flex flex-col items-center gap-3">
        {qr && <img src={qr} alt="QR du compte" className="w-44 rounded-xl border border-gray-100" />}
        <p className="text-[11px] text-gray-400">Scannez pour retrouver les coordonnées bancaires</p>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5">
          <span className="flex-1">
            <span className="block text-[11px] font-semibold text-brand-500">Banque</span>
            <span className="text-sm font-bold text-brand-800">{compteManuel.bankName || '—'}</span>
          </span>
          <button className="btn btn-secondary !px-2.5 !py-1.5 text-xs" onClick={() => copier(compteManuel.bankName, 'Banque')}>
            <Copy size={14} /> Copier
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5">
          <span className="flex-1">
            <span className="block text-[11px] font-semibold text-brand-500">Numéro de compte</span>
            <span className="text-sm font-bold text-brand-800">{compteManuel.accountNumber}</span>
          </span>
          <button className="btn btn-secondary !px-2.5 !py-1.5 text-xs" onClick={() => copier(compteManuel.accountNumber, 'Compte')}>
            <Copy size={14} /> Copier
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5">
          <span className="flex-1">
            <span className="block text-[11px] font-semibold text-brand-500">Nom du titulaire</span>
            <span className="text-sm font-bold text-brand-800">{compteManuel.accountName || '—'}</span>
          </span>
        </div>
        {reference && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
            <span className="flex-1">
              <span className="block text-[11px] font-semibold text-emerald-600">Votre référence (à saisir dans le libellé)</span>
              <span className="font-mono text-sm font-bold text-emerald-800">{reference}</span>
            </span>
            <button className="btn btn-secondary !px-2.5 !py-1.5 text-xs" onClick={() => copier(reference, 'Référence')}>
              <Copy size={14} /> Copier
            </button>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        Le responsable validera le paiement après réception du virement.
      </p>
    </div>
  )
}
