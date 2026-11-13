import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Wallet, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getReference } from '../../lib/cotisation'
import { formatMontant } from '../../lib/format'
import { syncDisponible } from '../../lib/cloudApi'
import { normaliserCompteCollecte } from '../../lib/paiementSimple'

// Mappe un objet de collecte (group.collecte) vers les libellés d'affichage.
// La valeur vient d'un autre appareil : elle n'est rendue cliquable que si
// c'est un lien de paiement Money Fusion (https, page payin.moneyfusion.net).
function infosCollecte(col) {
  const compteValeur = (col.compte || '').trim()
  const normalise = normaliserCompteCollecte(compteValeur)
  return {
    type: 'moneyfusion',
    titre: 'Money Fusion',
    compteLabel: 'Lien de paiement Money Fusion',
    compteValeur,
    titulaire: col.titulaire || '',
    lien: normalise ? normalise.url : null,
  }
}

export default function CompteCotisation({ group }) {
  const { utilisateur } = useAuth()
  const toast = useToast()
  const code = group.codeUnique
  const uid = utilisateur ? utilisateur.uid : null

  const [reference, setReference] = useState('')
  const [qr, setQr] = useState('')
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    let annule = false
    if (!code) { setChargement(false); return }
    getReference(code).catch(() => '').then((ref) => {
      if (annule) return
      setReference(ref || '')
      setChargement(false)
    })
    return () => { annule = true }
  }, [code])

  // QR code du compte de collecte du responsable.
  useEffect(() => {
    const c = (group.collecte || group.banque) ? infosCollecte(group.collecte || group.banque) : null
    if (!c || !c.compteValeur) { setQr(''); return }
    const texte = [
      'TONTINE ' + (group.nom || ''),
      'MOYEN: ' + c.titre,
      c.compteLabel.toUpperCase() + ': ' + c.compteValeur,
      'TITULAIRE: ' + (c.titulaire || ''),
      c.lien ? 'LIEN: ' + c.lien : null,
      reference ? 'REFERENCE: ' + reference : '',
    ].filter(Boolean).join('\n')
    QRCode.toDataURL(texte, { width: 240, margin: 1 }).then(setQr).catch(() => setQr(''))
  }, [group.collecte, group.banque, reference, group.nom])

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

  const compteManuel = (group.collecte || group.banque) ? infosCollecte(group.collecte || group.banque) : null

  const estResponsable = Array.isArray(group.membres) && group.membres.some(
    (m) => m.uid === uid && (m.role === 'responsable' || m.role === 'proprietaire')
  )

  // Lien de collecte enregistré par le responsable (compte Money Fusion).
  if (compteManuel) {
    return (
      <div className="card mb-4 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Wallet size={16} className="text-brand-600" />
          <p className="text-sm font-bold text-gray-800">Compte de cotisation ({compteManuel.titre})</p>
        </div>
        <p className="text-xs text-gray-500">
          Ouvre le lien de paiement et envoie <span className="font-semibold text-gray-700">{formatMontant(group.montantCotisation, group)}</span>
          {' '}au compte de <span className="font-semibold text-gray-700">{compteManuel.titulaire || 'ton responsable'}</span> sur Money Fusion.
          {' '}Indique la référence ci-dessous en libellé, puis signale le paiement dans l'onglet Argent, section Paiements (J'ai payé).
        </p>
        {compteManuel.lien && (
          <a href={compteManuel.lien} target="_blank" rel="noreferrer" className="mt-2 block rounded-xl bg-brand-600 px-3 py-2 text-center text-sm font-semibold text-white">
            Ouvrir {compteManuel.titre}
          </a>
        )}
        <div className="mt-3 space-y-2">
          <Ligne label={compteManuel.compteLabel} valeur={compteManuel.compteValeur} onCopier={() => copier(compteManuel.compteValeur, compteManuel.compteLabel)} />
          {compteManuel.titulaire && <Ligne label="Nom du titulaire" valeur={compteManuel.titulaire} />}
          {reference && (
            <Ligne label="Votre référence" valeur={reference} onCopier={() => copier(reference, 'Référence')} />
          )}
        </div>
        <div className="mt-3 flex flex-col items-center gap-3">
          {qr && <img src={qr} alt="QR du compte" className="w-44 rounded-xl border border-gray-100" />}
          <p className="text-[11px] text-gray-400">Scannez pour retrouver le lien et la référence</p>
        </div>
      </div>
    )
  }

  // Aucun compte de collecte : le responsable doit le renseigner.
  return (
    <div className="card mb-4 p-4 text-sm text-gray-500">
      {chargement ? (
        <span className="flex items-center gap-2"><Loader2 size={14} /> Chargement…</span>
      ) : estResponsable ? (
        <p>Le lien de paiement Money Fusion n'est pas encore configuré côté serveur. Un administrateur doit le déclarer : le bouton « Payer » apparaîtra ensuite chez tous les membres.</p>
      ) : (
        <p>Aucun moyen de paiement configuré pour l'application. Le bouton « Payer » apparaîtra quand l'administrateur aura déclaré le lien Money Fusion côté serveur.</p>
      )}
    </div>
  )
}

function Ligne({ label, valeur, onCopier }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5">
      <span className="flex-1">
        <span className="block text-[11px] font-semibold text-brand-500">{label}</span>
        <span className="text-sm font-bold text-brand-800">{valeur}</span>
      </span>
      {onCopier && (
        <button className="btn btn-secondary !px-2.5 !py-1.5 text-xs" onClick={onCopier}>
          <Copy size={14} /> Copier
        </button>
      )}
    </div>
  )
}
