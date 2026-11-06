import { useEffect, useState } from 'react'
import {
  Wallet, Smartphone, CheckCircle2, Copy, ArrowLeftRight, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getMembres, signalerPaiementMembre } from '../../lib/db'
import { getReference } from '../../lib/cotisation'
import { formatMontant, formatDate } from '../../lib/format'
import { genererLiensPaiement, ouvrirPaiement } from '../../lib/paiementSimple'
import { getPaiementsTour, STATUT } from '../../lib/paiements'
import CompteCotisation from './CompteCotisation'

const PENDING_KEY = 'wave_pending_paiement'

// Refus du responsable : la raison doit rester à l'écran aussi longtemps qu'elle
// n'est pas couverte par un nouveau signalement, sinon le membre croit payer deux fois.
function BanniereRefus({ refus }) {
  if (!refus) return null
  return (
    <div className="card mb-4 border-danger-200 p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-danger-600" />
        <p className="text-sm font-extrabold text-danger-700">Signalement refusé</p>
      </div>
      <p className="text-xs font-semibold text-danger-700">{refus.motif}</p>
      <p className="mt-1 text-[11px] text-gray-500">
        {refus.par ? `Par ${refus.par} · ` : ''}{refus.le ? `le ${formatDate(String(refus.le).slice(0, 10))}` : ''}
      </p>
      <p className="mt-2 text-xs text-gray-600">
        Ta cotisation n'est pas enregistrée. Vérifie l'envoi — ou refais-le — puis signale à nouveau le paiement.
      </p>
    </div>
  )
}

// Ligne d'information copiable (code USSD, référence) : le membre peut la
// coller ailleurs si le composeur automatique ne se déclenche pas.
function LigneCopiable({ label, valeur, onCopier }) {
  if (!valeur) return null
  return (
    <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="truncate font-mono text-xs font-semibold text-gray-700">{valeur}</p>
      </div>
      <button
        type="button"
        onClick={onCopier}
        className="btn-icon !h-8 !w-8 shrink-0"
        aria-label={`Copier ${label.toLowerCase()}`}
      >
        <Copy size={14} />
      </button>
    </div>
  )
}

export default function PayerMaCotisation({ group, membre, tour }) {
  const { utilisateur } = useAuth()
  const toast = useToast()
  const uid = utilisateur ? utilisateur.uid : null

  const [reference, setReference] = useState('')
  const [statut, setStatut] = useState('idle') // idle | initie | confirme
  const [autre, setAutre] = useState(false)

  const montant = group.montantCotisation
  const membreNom = membre ? membre.nom : (utilisateur ? utilisateur.displayName || 'Membre' : 'Membre')

  const ligne = membre && tour
    ? getPaiementsTour(group, tour).find((l) => Number(l.membre.id) === Number(membre.id))
    : null
  const refus = ligne && ligne.statut === STATUT.REJETE ? ligne.rejet : null

  // Lien de collecte SasPay enregistré par le responsable (compte de collecte).
  const responsable = getMembres(group.id).find((m) => m.role === 'responsable') || {}
  const lienSasPay = ((group.collecte && group.collecte.compte) || '').trim()

  const liens = genererLiensPaiement({
    lienSasPay,
    montant,
    nomResponsable: responsable.nom || '',
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
        const signale = signalerPaiementMembre(p.groupId, {
          nom: p.nom,
          montant: p.montant,
          operateur: p.operateur,
          numeroEmetteur: '',
          reference: p.reference,
          tourId: p.tourId,
          tourNumero: p.tourNumero,
          membreId: p.membreId,
        })
        // null = rien n'a été écrit (hors ligne) : ne pas confirmer au membre.
        if (signale == null) {
          toast.error('Signalement impossible (groupe en lecture seule ou hors ligne).')
          return
        }
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

  const copier = async (valeur, quoi) => {
    try {
      await navigator.clipboard.writeText(String(valeur))
      toast.success(`${quoi} copié`)
    } catch {
      toast.error('Copie impossible')
    }
  }

  const initier = () => {
    setStatut('initie')
    const lien = liens.saspay
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({
        groupId: group.id,
        nom: membreNom,
        montant,
        operateur: 'SasPay',
        reference,
        tourId: tour ? tour.id : undefined,
        tourNumero: tour ? tour.numero : undefined,
        membreId: membre ? membre.id : undefined,
      }))
    } catch {}
    const ok = ouvrirPaiement('saspay', lien)
    if (!ok) {
      toast.error('Lien de paiement SasPay indisponible')
    }
  }

  const confirmer = () => {
    try { sessionStorage.removeItem(PENDING_KEY) } catch {}
    try {
      const signale = signalerPaiementMembre(group.id, {
        nom: membreNom,
        montant,
        operateur: 'SasPay',
        numeroEmetteur: '',
        reference,
        tourId: tour ? tour.id : undefined,
        tourNumero: tour ? tour.numero : undefined,
        membreId: membre ? membre.id : undefined,
      })
      // null = rien n'a été écrit (hors ligne) : ne pas confirmer au membre.
      if (signale == null) {
        toast.error('Signalement impossible (groupe en lecture seule ou hors ligne).')
        return
      }
      setStatut('confirme')
      toast.success('Paiement signalé — en attente de confirmation du responsable')
    } catch (e) {
      toast.error((e && e.message) || 'Signalement impossible')
    }
  }

  const abandonner = () => {
    try { sessionStorage.removeItem(PENDING_KEY) } catch {}
    setStatut('idle')
  }

  if (statut === 'confirme') {
    return (
      <div className="card mb-4 border-success-200 p-4 text-center">
        <CheckCircle2 size={30} className="mx-auto mb-2 text-success-600" />
        <p className="text-sm font-extrabold text-gray-800">Paiement signalé</p>
        <p className="mt-1 text-xs text-gray-500">
          {formatMontant(montant, group)} signalé{tour ? ` pour le tour #${tour.numero}` : ''}.
          Le responsable confirmera la cotisation dans l'application.
        </p>
        <button className="btn btn-secondary mt-3 w-full text-xs" onClick={() => setStatut('idle')}>
          <ArrowLeftRight size={14} className="mr-1.5" /> Signaler un autre paiement
        </button>
      </div>
    )
  }

  if (!liens.peutPayer || autre) {
    return (
      <div className="mb-4">
        <BanniereRefus refus={refus} />
        {!liens.peutPayer && !autre && (
          <p className="mb-2 flex items-start gap-2 rounded-xl bg-warning-50 px-3 py-2 text-xs font-semibold text-warning-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {lienSasPay
              ? "Le lien enregistré n'est pas un lien de paiement SasPay : le responsable doit le corriger dans l'onglet Argent, section Trésorerie."
              : "Le responsable n'a pas encore enregistré de lien de paiement SasPay."}
          </p>
        )}
        {autre && (
          <button className="mb-2 w-full text-left text-xs font-semibold text-brand-600" onClick={() => setAutre(false)}>
            ← Retour aux paiements rapides
          </button>
        )}
        <CompteCotisation group={group} />
      </div>
    )
  }

  if (statut === 'initie') {
    return (
      <div className="card mb-4 border-brand-200 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Smartphone size={16} className="text-brand-600" />
          <p className="text-sm font-extrabold text-gray-800">Paiement engagé</p>
        </div>
        <p className="text-xs text-gray-500">
          {formatMontant(montant, group)}
          {liens.nomResponsable ? ` → ${liens.nomResponsable}` : ''}.
          Le signalement part automatiquement quand tu reviens dans l'app.
        </p>
        <button className="btn btn-primary mt-3 w-full !py-3 text-sm" onClick={confirmer}>
          <CheckCircle2 size={17} className="mr-1.5" /> Oui, j'ai payé
        </button>
        <button className="mt-2 w-full text-center text-xs font-medium text-gray-500 underline" onClick={abandonner}>
          Problème / annuler
        </button>
      </div>
    )
  }

  return (
    <div>
      <BanniereRefus refus={refus} />
      <div className="card mb-4 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wallet size={16} className="text-brand-600" />
          <p className="text-sm font-extrabold text-gray-800">Payer ma cotisation</p>
        </div>

        <div className="mb-3 rounded-2xl bg-brand-50 px-3 py-2.5 text-center">
          <p className="text-xl font-extrabold text-brand-700">{formatMontant(montant, group)}</p>
          <p className="mt-0.5 text-xs text-brand-600">
            {liens.nomResponsable ? `à ${liens.nomResponsable}` : 'au responsable'}
            {tour ? ` · tour #${tour.numero}` : ''}
          </p>
        </div>

        {reference && (
          <LigneCopiable label="Référence à mettre en libellé" valeur={reference} onCopier={() => copier(reference, 'Référence')} />
        )}

        <div className="mt-3 space-y-3">
          {liens.saspay.url && (
            <div>
              <button className="btn btn-primary w-full !py-3 text-sm" onClick={() => initier()}>
                <Smartphone size={17} className="mr-1.5" /> Payer avec SasPay
              </button>
              <LigneCopiable label="Lien de paiement" valeur={liens.saspay.url} onCopier={() => copier(liens.saspay.url, 'Lien de paiement')} />
              <p className="mt-2 text-xs text-gray-500">
                Ouvre SasPay, envoie ce montant, puis reviens ici confirmer.
              </p>
            </div>
          )}
        </div>

        <button
          className="mt-3 w-full text-center text-xs font-medium text-gray-500 underline"
          onClick={() => setAutre(true)}
        >
          Autre moyen de paiement
        </button>
      </div>
    </div>
  )
}
