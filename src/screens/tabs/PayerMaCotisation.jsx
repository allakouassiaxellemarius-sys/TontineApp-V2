import { useEffect, useState } from 'react'
import { Smartphone, Wallet, CheckCircle2, AlertTriangle, MessageCircle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getMembres, signalerPaiementMembre } from '../../lib/db'
import { getReference } from '../../lib/cotisation'
import { formatMontant } from '../../lib/format'
import { genererLiensPaiement, ouvrirPaiement } from '../../lib/paiementSimple'
import CompteCotisation from './CompteCotisation'

const PENDING_KEY = 'wave_pending_paiement'

export default function PayerMaCotisation({ group, membre, tour }) {
  const { utilisateur } = useAuth()
  const toast = useToast()
  const uid = utilisateur ? utilisateur.uid : null

  const [reference, setReference] = useState('')
  const [statut, setStatut] = useState('idle') // idle | initie | confirme
  const [autre, setAutre] = useState(false)

  const montant = group.montantCotisation
  const membreNom = membre ? membre.nom : (utilisateur ? utilisateur.displayName || 'Membre' : 'Membre')

  // Téléphone du responsable : compte de réception prioritaire, sinon membre "responsable".
  const telResponsable =
    (group.receptionMM && group.receptionMM.numero) ||
    (getMembres(group.id).find((m) => m.role === 'responsable') || {}).telephone ||
    ''
  const waveSlug = (group.waveSlug || '').trim()

  const liens = genererLiensPaiement({
    montant,
    telResponsable,
    waveSlug,
    nomResponsable: (getMembres(group.id).find((m) => m.role === 'responsable') || {}).nom || '',
    nomTontine: group.nom,
    tourNumero: tour ? tour.numero : null,
  })

  useEffect(() => {
    if (group.codeUnique && uid) {
      getReference(group.codeUnique).then((r) => setReference(r || '')).catch(() => {})
    }
  }, [group.codeUnique, uid])

  // Signalement automatique au retour dans l'app (après le paiement), pour
  // éviter au membre de cliquer séparément sur « J'ai payé ».
  useEffect(() => {
    const tenter = () => {
      if (document.visibilityState !== 'visible') return
      const raw = sessionStorage.getItem(PENDING_KEY)
      if (!raw) return
      let p
      try { p = JSON.parse(raw) } catch { sessionStorage.removeItem(PENDING_KEY); return }
      sessionStorage.removeItem(PENDING_KEY)
      try {
        signalerPaiementMembre(p.groupId, {
          nom: p.nom,
          montant: p.montant,
          operateur: p.operateur,
          numeroEmetteur: '',
          reference: p.reference,
          tourId: p.tourId,
          tourNumero: p.tourNumero,
          membreId: p.membreId,
        })
        setStatut('confirme')
        toast.success('Paiement signalé — en attente de confirmation du responsable')
      } catch (e) {
        toast.error((e && e.message) || 'Signalement impossible')
      }
    }
    document.addEventListener('visibilitychange', tenter)
    window.addEventListener('pageshow', tenter)
    return () => {
      document.removeEventListener('visibilitychange', tenter)
      window.removeEventListener('pageshow', tenter)
    }
  }, [toast])

  const initier = (type) => {
    setStatut('initie')
    const lien = type === 'wave' ? liens.wave : liens.om
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({
        groupId: group.id,
        nom: membreNom,
        montant,
        operateur: type === 'wave' ? 'Wave' : 'Orange Money',
        reference,
        tourId: tour ? tour.id : undefined,
        tourNumero: tour ? tour.numero : undefined,
        membreId: membre ? membre.id : undefined,
      }))
    } catch {}
    const ok = ouvrirPaiement(type, lien)
    if (!ok) {
      toast.error(type === 'wave' ? 'Lien Wave indisponible' : 'Lien Orange Money indisponible')
    }
  }

  const confirmer = () => {
    try { sessionStorage.removeItem(PENDING_KEY) } catch {}
    try {
      signalerPaiementMembre(group.id, {
        nom: membreNom,
        montant,
        operateur: 'Mobile Money',
        numeroEmetteur: '',
        reference,
        tourId: tour ? tour.id : undefined,
        tourNumero: tour ? tour.numero : undefined,
        membreId: membre ? membre.id : undefined,
      })
      setStatut('confirme')
      toast.success('Paiement signalé — en attente de confirmation du responsable')
    } catch (e) {
      toast.error((e && e.message) || 'Signalement impossible')
    }
  }

  if (statut === 'confirme') {
    return (
      <div className="card mb-4 p-4 text-center">
        <CheckCircle2 size={28} className="mx-auto mb-2 text-success-600" />
        <p className="text-sm font-bold text-gray-800">Paiement signalé</p>
        <p className="mt-1 text-xs text-gray-500">
          Votre paiement de {formatMontant(montant, group)} a été signalé. Le responsable le confirmera dans l’application.
        </p>
      </div>
    )
  }

  if (!liens.peutPayer || autre) {
    return <CompteCotisation group={group} />
  }

  if (statut === 'initie') {
    return (
      <div className="card mb-4 p-4">
        <div className="mb-2 flex items-center gap-2">
          <MessageCircle size={16} className="text-brand-600" />
          <p className="text-sm font-bold text-gray-800">As-tu payé ?</p>
        </div>
        <p className="mb-3 text-xs text-gray-500">
          {formatMontant(montant, group)} {liens.nomResponsable ? `→ ${liens.nomResponsable}` : ''}. Dès que tu reviens dans l'app, le paiement est signalé automatiquement.
        </p>
        <button className="btn btn-primary w-full !py-3 text-base" onClick={confirmer}>
          <CheckCircle2 size={18} className="mr-2" /> Oui, j'ai payé
        </button>
        <button
          className="mt-2 w-full text-center text-xs font-medium text-gray-500 underline"
          onClick={() => { try { sessionStorage.removeItem(PENDING_KEY) } catch {}; setStatut('idle') }}
        >
          Problème / annuler
        </button>
      </div>
    )
  }

  return (
    <div className="card mb-4 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Wallet size={16} className="text-brand-600" />
        <p className="text-sm font-bold text-gray-800">Payer ma cotisation</p>
      </div>
      <p className="mb-3 text-center text-sm font-bold text-gray-800">
        {formatMontant(montant, group)}
        {liens.nomResponsable ? <span className="block text-xs font-normal text-gray-500">à {liens.nomResponsable}</span> : null}
      </p>

      {liens.wave.dispo && (
        <button className="btn btn-primary mt-1 w-full !py-3 text-base" onClick={() => initier('wave')}>
          <Smartphone size={18} className="mr-2" /> Payer avec Wave
        </button>
      )}
      {liens.om.dispo && (
        <button
          className={`w-full !py-3 text-base ${liens.wave.dispo ? 'btn btn-secondary mt-2' : 'btn btn-primary mt-1'}`}
          onClick={() => initier('om')}
        >
          <Smartphone size={18} className="mr-2" /> Payer avec Orange Money
        </button>
      )}

      {reference && (
        <p className="mt-2 text-center text-[11px] text-gray-400">
          Ajoutez la référence « {reference} » dans le libellé du transfert.
        </p>
      )}

      <button
        className="mt-3 w-full text-center text-xs font-medium text-gray-500 underline"
        onClick={() => setAutre(true)}
      >
        Autre moyen de paiement
      </button>
    </div>
  )
}
