import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Wallet, Sparkles, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getReference } from '../../lib/cotisation'
import { formatMontant } from '../../lib/format'
import { syncDisponible, getCompteVirtuel, creerCompteVirtuel } from '../../lib/cloudApi'

// Mappe un objet de collecte (group.collecte) vers les libellés d'affichage.
function infosCollecte(col) {
  const type = 'pispi'
  const c = { titre: 'Pi-Spi', banqueLabel: '', compteLabel: 'Lien Pi-Spi' }
  const compteValeur = (col.compte || '').trim()
  const estLien = /^[a-z][a-z0-9+.-]*:\/\//i.test(compteValeur)
  return {
    type,
    titre: c.titre,
    banqueLabel: c.banqueLabel,
    banqueValeur: '',
    compteLabel: c.compteLabel,
    compteValeur: col.compte || '',
    titulaire: col.titulaire || '',
    lien: estLien ? compteValeur : null,
  }
}

export default function CompteCotisation({ group }) {
  const { utilisateur } = useAuth()
  const toast = useToast()
  const code = group.codeUnique
  const uid = utilisateur ? utilisateur.uid : null

  const [reference, setReference] = useState('')
  const [qr, setQr] = useState('')
  const [compteVA, setCompteVA] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [creation, setCreation] = useState(false)

  useEffect(() => {
    let annule = false
    if (!code) { setChargement(false); return }
    Promise.all([
      getReference(code).catch(() => ''),
      syncDisponible() ? getCompteVirtuel(code).catch(() => null) : Promise.resolve(null),
    ]).then(([ref, va]) => {
      if (annule) return
      setReference(ref || '')
      setCompteVA(va || null)
      setChargement(false)
    })
    return () => { annule = true }
  }, [code])

  // QR code du compte (virtuel, collecte Mobile Money/Wave, ou bancaire).
  useEffect(() => {
    const c = compteVA || ((group.collecte || group.banque) ? infosCollecte(group.collecte || group.banque) : null)
    if (!c || !c.compteValeur) { setQr(''); return }
    const texte = [
      'TONTINE ' + (group.nom || ''),
      'MOYEN: ' + c.titre,
      c.banqueLabel ? c.banqueLabel.toUpperCase() + ': ' + c.banqueValeur : null,
      c.compteLabel.toUpperCase() + ': ' + c.compteValeur,
      'TITULAIRE: ' + (c.titulaire || ''),
      c.lien ? 'LIEN: ' + c.lien : null,
      reference ? 'REFERENCE: ' + reference : '',
    ].filter(Boolean).join('\n')
    QRCode.toDataURL(texte, { width: 240, margin: 1 }).then(setQr).catch(() => setQr(''))
  }, [compteVA, group.collecte, group.banque, reference, group.nom])

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

  const creerCompte = async () => {
    setCreation(true)
    try {
      const responsable = (group.membres || []).find((m) => m.role === 'responsable') || (group.membres || [])[0] || {}
      const res = await creerCompteVirtuel(code, {
        name: responsable.nom || group.nom,
        email: responsable.email || '',
        phone: responsable.telephone || '',
      })
      setCompteVA(res.compte)
      toast.success('Compte de cotisation automatique créé')
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Création impossible (clé Flutterwave manquante ?)')
    } finally {
      setCreation(false)
    }
  }

  // 1) Compte virtuel Flutterwave automatique (prioritaire)
  if (compteVA && compteVA.accountNumber) {
    return (
      <div className="card mb-4 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={16} className="text-brand-600" />
          <p className="text-sm font-bold text-gray-800">Compte de cotisation (automatique)</p>
          <span className="rounded bg-success-100 px-1.5 py-0.5 text-[10px] font-semibold text-success-700">FLUTTERWAVE</span>
        </div>
        <p className="text-xs text-gray-500">
          Virez <span className="font-semibold text-gray-700">{formatMontant(group.montantCotisation, group)}</span> sur ce compte
          et indiquez <span className="font-semibold text-gray-700">votre référence</span> en libellé. Le paiement est
          validé automatiquement par le webhook Flutterwave.
        </p>
        <div className="mt-3 flex flex-col items-center gap-3">
          {qr && <img src={qr} alt="QR du compte" className="w-44 rounded-xl border border-gray-100" />}
          <p className="text-[11px] text-gray-400">Scannez pour retrouver les coordonnées</p>
        </div>
        <div className="mt-3 space-y-2">
          <Ligne label="Banque" valeur={compteVA.bankName || '—'} onCopier={() => copier(compteVA.bankName, 'Banque')} />
          <Ligne label="Numéro de compte" valeur={compteVA.accountNumber} onCopier={() => copier(compteVA.accountNumber, 'Compte')} />
          <Ligne label="Nom du titulaire" valeur={compteVA.accountName || '—'} />
          {reference && (
            <Ligne label="Votre référence (libellé)" valeur={reference} onCopier={() => copier(reference, 'Référence')} />
          )}
        </div>
      </div>
    )
  }

  // 2) Compte de collecte saisi par le responsable (virement / Mobile Money / Wave)
  if (compteManuel) {
    return (
      <div className="card mb-4 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Wallet size={16} className="text-brand-600" />
          <p className="text-sm font-bold text-gray-800">Compte de cotisation ({compteManuel.titre})</p>
          <span className="rounded bg-success-100 px-1.5 py-0.5 text-[10px] font-semibold text-success-700">MANUEL</span>
        </div>
        <p className="text-xs text-gray-500">
          Payez <span className="font-semibold text-gray-700">{formatMontant(group.montantCotisation, group)}</span> via {compteManuel.titre}
          {compteManuel.lien ? ' (ouvrez le lien Pi-Spi ci-dessous pour payer)' : ' et indiquez votre référence'}.
          Signalez ensuite le paiement dans l'onglet Argent, section Paiements (J'ai payé).
        </p>
        {compteManuel.lien && (
          <a href={compteManuel.lien} target="_blank" rel="noreferrer" className="mt-2 block rounded-xl bg-brand-600 px-3 py-2 text-center text-sm font-semibold text-white">
            Ouvrir {compteManuel.titre} ({compteManuel.compteValeur})
          </a>
        )}
        <div className="mt-3 flex flex-col items-center gap-3">
          {qr && <img src={qr} alt="QR du compte" className="w-44 rounded-xl border border-gray-100" />}
          <p className="text-[11px] text-gray-400">Scannez pour retrouver les coordonnées</p>
        </div>
        <div className="mt-3 space-y-2">
          {compteManuel.banqueLabel && (
            <Ligne label={compteManuel.banqueLabel} valeur={compteManuel.banqueValeur || '—'} onCopier={() => copier(compteManuel.banqueValeur, compteManuel.banqueLabel)} />
          )}
          <Ligne label={compteManuel.compteLabel} valeur={compteManuel.compteValeur} onCopier={() => copier(compteManuel.compteValeur, compteManuel.compteLabel)} />
          <Ligne label="Nom du titulaire" valeur={compteManuel.titulaire || '—'} />
          {reference && (
            <Ligne label="Votre référence" valeur={reference} onCopier={() => copier(reference, 'Référence')} />
          )}
        </div>
      </div>
    )
  }

  // 3) Aucun compte : le responsable peut créer le compte automatique Flutterwave
  return (
    <div className="card mb-4 p-4 text-sm text-gray-500">
      {chargement ? (
        <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Chargement…</span>
      ) : estResponsable ? (
        <div>
          <p className="mb-3">Aucun compte de cotisation configuré. Renseigne ton lien de collecte Pi-Spi dans l'onglet Argent, section Trésorerie. Tu peux aussi créer un compte virtuel Flutterwave automatique (nécessite une clé API Flutterwave).</p>
          <button className="btn btn-primary" disabled={creation} onClick={creerCompte}>
            {creation ? <><Loader2 size={14} className="animate-spin" /> Création…</> : <><Sparkles size={14} /> Créer le compte automatique</>}
          </button>
        </div>
      ) : (
        <p>Aucun compte configuré pour ce groupe. Le responsable peut renseigner son lien de collecte Pi-Spi dans son onglet Argent, section Trésorerie, ou créer un compte virtuel Flutterwave.</p>
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
