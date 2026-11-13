import { useState } from 'react'
import {
  ReceiptText, Send, AlertTriangle, Smartphone, MessageCircle,
  UserCheck, XCircle, Undo2, BellRing, Layers, Check,
} from 'lucide-react'
import { useData } from '../../../context/DataContext'
import { useToast } from '../../../context/ToastContext'
import { todayStr } from '../../../lib/storage'
import { MOTIF_REJET_MAX } from '../../../lib/db'
import { haptic } from '../../../lib/haptique'
import {
  getPaiementsTour, resumeTour, STATUT,
  enregistrerPaiement, signalerPaiement, confirmerSignalement, rejeterSignalement,
  retirerPaiement, retirerSignalement,
} from '../../../lib/paiements'
import { formatMontant, formatDate } from '../../../lib/format'
import { penaliteEstimee } from '../../../lib/penalty'
import { exporterRecuPDF } from '../../../lib/export'
import { getReference } from '../../../lib/cotisation'
import { envoyerRappel, telephoneValide, ouvrirLien } from '../../../lib/remind'
import Modal from '../../../components/Modal'
import Avatar from '../../../components/Avatar'
import Menu from '../../../components/ui/Menu'

const Puce = ({ children, ton }) => (
  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${ton}`}>{children}</span>
)

const TON_STATUT = {
  [STATUT.EN_ATTENTE]: 'bg-gray-100 text-gray-600',
  [STATUT.SIGNALE]: 'bg-warning-100 text-warning-700',
  [STATUT.REJETE]: 'bg-danger-100 text-danger-700',
  [STATUT.PAYE]: 'bg-success-100 text-success-700',
}

const LIBELLES = {
  [STATUT.EN_ATTENTE]: 'À payer',
  [STATUT.SIGNALE]: 'Signalé',
  [STATUT.REJETE]: 'Refusé',
  [STATUT.PAYE]: 'Payé',
}

// Motifs de refus proposés au responsable : le refus doit rester explicable
// sans devoir rédiger à chaque fois. Le champ texte reste modifiable.
const MOTIFS_REJET = ['Paiement non reçu', 'Montant incorrect', 'Mauvais tour', 'Déjà enregistré']

// Pastilles de choix : un <select> de 2 ou 3 options est plus long à ouvrir
// qu'à tapoter, et il masque les autres possibilités.
function Choix({ legend, options, valeur, onChange }) {
  return (
    <div>
      <p className="label">{legend}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const actif = valeur === o
          return (
            <button
              key={o}
              type="button"
              aria-pressed={actif}
              onClick={() => onChange(o)}
              className={`rounded-full border px-3.5 py-2 text-xs font-bold ${
                actif ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}
            >
              {o}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LignePaiement({ groupe, tour, ligne, estGerant, isOwn, penalite, handlers }) {
  const { membre, statut, paiement, signalement, rejet } = ligne
  const enRetard = statut === STATUT.EN_ATTENTE && tour.datePrevue < todayStr()

  // Un refus n'efface pas la dette : la ligne reste à encaisser côté responsable,
  // et le membre peut re-signaler après avoir corrigé son envoi.
  const action =
    estGerant && statut === STATUT.SIGNALE
      ? { label: 'Confirmer', onClick: () => handlers.onConfirmer(signalement) }
      : estGerant && (statut === STATUT.EN_ATTENTE || statut === STATUT.REJETE)
      ? { label: 'Enregistrer', onClick: () => handlers.onEnregistrer(membre) }
      : !estGerant && isOwn && statut === STATUT.EN_ATTENTE
      ? { label: 'J\'ai payé', onClick: () => handlers.onSignaler(membre) }
      : !estGerant && isOwn && statut === STATUT.REJETE
      ? { label: 'Re-signaler', onClick: () => handlers.onSignaler(membre) }
      : null

  const menu = []
  if (estGerant && statut === STATUT.SIGNALE) {
    menu.push({ label: 'Rejeter le signalement', icon: XCircle, danger: true, onClick: () => handlers.onRejeter(signalement) })
  }
  if (estGerant && (statut === STATUT.EN_ATTENTE || statut === STATUT.REJETE) && enRetard && telephoneValide(membre.telephone)) {
    menu.push({ label: `Relancer ${membre.nom}`, icon: BellRing, onClick: () => handlers.onRelancer(membre) })
  }
  if (statut === STATUT.PAYE && paiement) {
    menu.push({ label: 'Reçu PDF', icon: ReceiptText, onClick: () => handlers.onReceipt(paiement) })
  }
  if (estGerant && statut === STATUT.PAYE) {
    menu.push({ label: 'Retirer le paiement', icon: Undo2, danger: true, onClick: () => handlers.onRetirerPaiement(membre) })
  }
  if (!estGerant && isOwn && statut === STATUT.SIGNALE) {
    menu.push({ label: 'Retirer mon signalement', icon: Undo2, danger: true, onClick: () => handlers.onRetirerSignalement(signalement) })
  }

  const detail = statut === STATUT.PAYE && paiement
    ? `le ${formatDate(paiement.datePaiement)} · ${paiement.moyenPaiement || '—'}`
    : statut === STATUT.REJETE
    // Le membre retrouve le motif complet dans sa bannière ; le responsable,
    // lui, le lit sous la ligne.
    ? (rejet && isOwn && !estGerant ? rejet.motif : `${signalement?.operateur || 'Money Fusion'} refusé`)
    : statut === STATUT.SIGNALE && signalement
    ? `${signalement.operateur || 'Money Fusion'}${signalement.reference ? ` · réf ${signalement.reference}` : ''}`
    : enRetard
    ? `en attente depuis le ${formatDate(tour.datePrevue)}`
    : `prévu le ${formatDate(tour.datePrevue)}`

  return (
    <div className={`card p-3.5 ${statut === STATUT.PAYE ? 'border-success-200' : ''} ${statut === STATUT.REJETE ? 'border-danger-200' : ''} ${enRetard ? 'border-l-4 border-l-danger-500' : ''}`}>
      <div className="flex items-center gap-3">
        <Avatar nom={membre.nom} size={38} />
        <p className="min-w-0 flex-1 truncate text-sm font-bold">
          {membre.nom}
          {isOwn && <span className="ml-1 text-[11px] font-semibold text-brand-600">(vous)</span>}
        </p>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-extrabold">{formatMontant(groupe.montantCotisation, groupe)}</span>
          {penalite > 0 && (
            <span className="flex items-center justify-end gap-1 text-[11px] font-bold text-danger-500">
              <AlertTriangle size={11} /> +{formatMontant(penalite, groupe)}
            </span>
          )}
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <Puce ton={TON_STATUT[statut]}>{LIBELLES[statut]}</Puce>
        {enRetard && <Puce ton="bg-danger-100 text-danger-700">En retard</Puce>}
        <span className="min-w-0 flex-1 truncate text-[11px] text-gray-500">{detail}</span>
        {action && (
          <button
            type="button"
            className="btn btn-primary shrink-0 !px-3 !py-1.5 text-xs"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
        {menu.length > 0 && <Menu items={menu} ariaLabel={`Actions de ${membre.nom}`} />}
      </div>

      {/* Le motif du refus reste lisible en entier : c'est la seule information
          qui dit au responsable ce qu'il a écarté (le membre, lui, le lit dans
          la bannière « Signalement refusé » de son écran de paiement). */}
      {statut === STATUT.REJETE && rejet && (estGerant || !isOwn) && (
        <p className="mt-2 rounded-xl bg-danger-50 px-3 py-2 text-xs font-semibold text-danger-700">
          Signalement refusé : {rejet.motif}
          <span className="block font-medium text-danger-600">
            {rejet.par ? `par ${rejet.par} · ` : ''}{rejet.le ? `le ${formatDate(String(rejet.le).slice(0, 10))}` : ''}
          </span>
        </p>
      )}
    </div>
  )
}

export default function PaiementTour({ groupe, tour, estGerant, membreConnecte }) {
  const { refresh } = useData()
  const toast = useToast()

  const lignes = getPaiementsTour(groupe, tour)
  const resume = resumeTour(groupe, tour)
  const today = todayStr()

  const [enrModal, setEnrModal] = useState(null)
  const [moyen, setMoyen] = useState('')
  const [opNumero, setOpNumero] = useState('')
  const [opReference, setOpReference] = useState('')
  const [datePaiement, setDatePaiement] = useState(today)

  const [sigModal, setSigModal] = useState(null)
  const [sigOperateur, setSigOperateur] = useState('')
  const [sigReference, setSigReference] = useState('')
  const [sigEnCours, setSigEnCours] = useState(false)

  const [rejModal, setRejModal] = useState(null)
  const [rejMotif, setRejMotif] = useState('')

  const [tout, setTout] = useState(null)

  // File d'attente : le responsable traite d'abord ce qui attend sa signature,
  // puis les retards ; les cotisations payées descendent en bas de liste.
  const estEnRetard = (l) => l.statut === STATUT.EN_ATTENTE && tour?.datePrevue < today
  const ordre = estGerant
    ? (l) => (l.statut === STATUT.SIGNALE ? 0 : estEnRetard(l) ? 1 : l.statut === STATUT.EN_ATTENTE ? 2 : 3)
    : (l) => (l.membre.id === membreConnecte?.id ? 0 : l.statut === STATUT.PAYE ? 2 : 1)
  const lignesTriees = [...lignes].sort((a, b) => ordre(a) - ordre(b))

  const aConfirmer = resume.signales
  const progression = resume.total ? Math.round((resume.payes / resume.total) * 100) : 0

  const ouvrirEnregistrer = (m) => {
    setMoyen('Money Fusion')
    setOpNumero('')
    setOpReference('')
    setDatePaiement(today)
    setEnrModal({ membre: m })
  }
  const confirmerEnregistrer = () => {
    const details = { operateur: 'Money Fusion', numero: opNumero.trim(), reference: opReference.trim() }
    const membre = enrModal.membre
    const payesAvant = getPaiementsTour(groupe, tour).filter((l) => l.statut === STATUT.PAYE).length
    enregistrerPaiement(groupe, tour, membre, groupe.montantCotisation, datePaiement, moyen, details)
    setEnrModal(null)
    refresh()
    // enregistrerPaiement échoue en silence (groupe invité ou hors ligne) :
    // on vérifie que la ligne a réellement été écrite avant d'annoncer le succès.
    const ecrits = getPaiementsTour(groupe, tour).filter((l) => l.statut === STATUT.PAYE).length - payesAvant
    if (ecrits <= 0) {
      toast.error('Enregistrement impossible (groupe en lecture seule ou hors ligne).')
      return
    }
    haptic.success()
    toast.success(`Cotisation de ${membre.nom} enregistrée`)
  }

  // Encaissement groupé : le responsable qui a reçu plusieurs cotisations d'un
  // coup (remise en main propre, virement groupé) ne doit pas les saisir une à une.
  const restants = lignes.filter((l) => l.statut !== STATUT.PAYE)
  const ouvrirToutEncaisser = () => setTout({ moyen: 'Money Fusion', date: today })
  const confirmerToutEncaisser = () => {
    const { moyen: m, date } = tout
    const membres = restants.map((l) => l.membre)
    for (const membre of membres) {
      enregistrerPaiement(groupe, tour, membre, groupe.montantCotisation, date, m, {})
    }
    setTout(null)
    refresh()
    const ecrits = getPaiementsTour(groupe, tour).filter((l) => l.statut === STATUT.PAYE).length - resume.payes
    if (ecrits <= 0) {
      toast.error('Enregistrement impossible (groupe en lecture seule ou hors ligne).')
      return
    }
    haptic.success()
    toast.success(`${ecrits} cotisation${ecrits > 1 ? 's' : ''} enregistrée${ecrits > 1 ? 's' : ''}`)
  }

  const ouvrirSignaler = (m) => {
    setSigOperateur('Money Fusion')
    setSigReference('')
    setSigEnCours(false)
    setSigModal({ membre: m })
    if (groupe.codeUnique && membreConnecte) {
      getReference(groupe.codeUnique).then((r) => setSigReference(r || '')).catch(() => {})
    }
  }
  const confirmerSignaler = () => {
    if (!sigModal) return
    setSigEnCours(true)
    try {
      const res = signalerPaiement(groupe, tour, sigModal.membre, {
        montant: groupe.montantCotisation,
        operateur: sigOperateur,
        reference: sigReference.trim(),
        membreId: sigModal.membre.id === membreConnecte?.id ? sigModal.membre.id : undefined,
      })
      // null = rien n'a été écrit (hors ligne) : ne pas annoncer l'envoi.
      if (res == null) { toast.error('Signalement impossible (hors ligne).'); return }
      setSigModal(null)
      refresh()
      haptic.success()
      toast.success('Paiement signalé — en attente de confirmation du responsable')
    } catch (e) {
      toast.error((e && e.message) || 'Envoi impossible')
    } finally {
      setSigEnCours(false)
    }
  }

  // Refus motivé : le signalement n'est pas effacé en silence, il est archivé
  // avec son motif pour que le membre sache quoi corriger.
  const ouvrirRejeter = (s) => {
    setRejMotif(MOTIFS_REJET[0])
    setRejModal({ signalement: s })
  }
  const confirmerRejeter = () => {
    if (!rejModal) return
    const s = rejModal.signalement
    const res = rejeterSignalement(groupe, s.id, rejMotif, membreConnecte?.nom || 'Responsable')
    if (!res.ok) { toast.error(res.message); return }
    setRejModal(null)
    refresh()
    haptic.tap()
    toast.info(`Signalement de ${s.nom || 'ce membre'} refusé, motif transmis`)
  }

  const handlers = {
    onEnregistrer: ouvrirEnregistrer,
    onRelancer: (m) => {
      if (!telephoneValide(m.telephone)) { toast.error(`Aucun numéro valide pour ${m.nom}`); return }
      const r = envoyerRappel(m, groupe, tour)
      if (r && r.url) { ouvrirLien(r.url); haptic.tap(); toast.success(`Relance WhatsApp préparée pour ${m.nom}`) }
      else if (r && r.ok) toast.success(`Relance envoyée à ${m.nom}`)
      else toast.error((r && r.raison) || 'Relance impossible')
    },
    onConfirmer: (s) => {
      const res = confirmerSignalement(groupe, s.id)
      if (res === true) { refresh(); haptic.success(); toast.success(`Cotisation de ${s.nom} confirmée`) }
      else if (res === 'deja') { refresh(); toast.info(`${s.nom} a déjà payé ce tour`) }
      else toast.error('Impossible de confirmer (membre ou tour introuvable)')
    },
    onRejeter: ouvrirRejeter,
    onRetirerPaiement: (m) => {
      const res = retirerPaiement(tour, m.id)
      refresh()
      if (!res.ok) { toast.error(res.message); return }
      haptic.tap(); toast.info(`Paiement de ${m.nom} retiré`)
    },
    onSignaler: ouvrirSignaler,
    onRetirerSignalement: (s) => {
      if (!retirerSignalement(groupe, s.id)) { toast.error('Retrait impossible (hors ligne).'); return }
      refresh(); toast.info('Signalement retiré')
    },
    onReceipt: (p) => { try { exporterRecuPDF(groupe.id, p.id) } catch (e) { toast.error('Reçu indisponible') } },
  }

  return (
    <div>
      {tour && (
        <div className="card mb-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Tour #{tour.numero} · bénéficiaire
              </p>
              <p className="truncate text-base font-extrabold">{tour.membre?.nom || '—'}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Pot</p>
              <p className="text-base font-extrabold text-success-600">{formatMontant(tour.montantPot || 0, groupe)}</p>
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <UserCheck size={14} className="text-brand-600" />
                {resume.payes} / {resume.total} payées
              </span>
              <span className="font-extrabold">{formatMontant(resume.montantPaye, groupe)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow={progression} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${progression}%` }} />
            </div>
          </div>

          {estGerant && aConfirmer > 0 && (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-warning-50 px-3 py-2 text-xs font-bold text-warning-700">
              <AlertTriangle size={14} className="shrink-0" />
              {aConfirmer} paiement{aConfirmer > 1 ? 's' : ''} signalé{aConfirmer > 1 ? 's' : ''} à confirmer
            </p>
          )}

          {estGerant && restants.length > 0 && (
            <button className="btn btn-secondary mt-3 w-full" onClick={ouvrirToutEncaisser}>
              <Layers size={16} /> Tout encaisser ({restants.length})
            </button>
          )}
        </div>
      )}

      <div className="space-y-2.5">
        {lignesTriees.map((ligne) => {
          const enRetard = estEnRetard(ligne)
          const penalite = ligne.paiement?.penalite ?? (enRetard ? penaliteEstimee(groupe, tour) : 0)
          return (
            <LignePaiement
              key={ligne.membre.id}
              groupe={groupe}
              tour={tour}
              ligne={ligne}
              estGerant={estGerant}
              isOwn={ligne.membre.id === membreConnecte?.id}
              penalite={penalite}
              handlers={handlers}
            />
          )
        })}
      </div>

      {/* Responsable : enregistrer une cotisation reçue hors application. */}
      <Modal
        open={!!enrModal}
        onClose={() => setEnrModal(null)}
        title="Enregistrer la cotisation"
        footer={
          <>
            <button className="btn btn-secondary flex-1" onClick={() => setEnrModal(null)}>Annuler</button>
            <button className="btn btn-primary flex-1" onClick={confirmerEnregistrer}>Valider</button>
          </>
        }
      >
        {enrModal && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3">
              <Avatar nom={enrModal.membre.nom} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-brand-800">{enrModal.membre.nom}</p>
                <p className="text-[11px] text-brand-600">Tour #{tour.numero}</p>
              </div>
              <p className="shrink-0 text-lg font-extrabold text-brand-700">{formatMontant(groupe.montantCotisation, groupe)}</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2">
                <Smartphone size={15} className="mt-0.5 shrink-0 text-brand-600" />
                <p className="text-xs text-brand-700">Paiement Money Fusion. Note le numéro émetteur et la référence : ce sont les seules traces en cas de litige.</p>
              </div>
              <div>
                <label className="label">Numéro émetteur</label>
                <input className="input" inputMode="tel" placeholder="Ex : 07 07 07 07 07" value={opNumero} onChange={(e) => setOpNumero(e.target.value)} />
              </div>
              <div>
                <label className="label">Référence de la transaction</label>
                <input className="input" placeholder="Ex : PMP3430D2X1" value={opReference} onChange={(e) => setOpReference(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">Date de paiement</label>
              <input className="input" type="date" value={datePaiement} onChange={(e) => setDatePaiement(e.target.value)} />
            </div>
          </div>
        )}
      </Modal>

      {/* Membre : déclarer l'envoi effectué vers le compte du responsable. */}
      <Modal
        open={!!sigModal}
        onClose={() => setSigModal(null)}
        title="Signaler mon paiement"
        footer={
          <>
            <button className="btn btn-secondary flex-1" onClick={() => setSigModal(null)}>Annuler</button>
            <button className="btn btn-primary flex-1" onClick={confirmerSignaler} disabled={sigEnCours}>
              <Send size={16} /> {sigEnCours ? 'Envoi…' : 'Envoyer'}
            </button>
          </>
        }
      >
        {sigModal && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-brand-50 p-3 text-center">
              <p className="text-xs font-semibold text-brand-600">Montant dû</p>
              <p className="text-xl font-extrabold text-brand-700">{formatMontant(groupe.montantCotisation, groupe)}</p>
              <p className="mt-1 text-xs text-brand-600">
                Via Money Fusion, vers le responsable
              </p>
            </div>
            <div>
              <label className="label">Référence de la transaction (optionnel)</label>
              <input className="input" placeholder="Ex : PMP3430D2X1" value={sigReference} onChange={(e) => setSigReference(e.target.value)} />
            </div>
            <p className="flex items-start gap-2 text-xs text-gray-500">
              <MessageCircle size={14} className="mt-0.5 shrink-0" />
              Le responsable reçoit ton signalement et confirme la cotisation dans l'application.
            </p>
          </div>
        )}
      </Modal>

      {/* Responsable : refuser un signalement, motif à l'appui. */}
      <Modal
        open={!!rejModal}
        onClose={() => setRejModal(null)}
        title="Rejeter le signalement"
        footer={
          <>
            <button className="btn btn-secondary flex-1" onClick={() => setRejModal(null)}>Annuler</button>
            <button
              className="btn btn-danger flex-1"
              onClick={confirmerRejeter}
              disabled={!rejMotif.trim()}
            >
              <XCircle size={16} /> Rejeter
            </button>
          </>
        }
      >
        {rejModal && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-gray-50 p-3">
              <p className="text-sm font-bold text-gray-800">{rejModal.signalement.nom || 'Membre'}</p>
              <p className="mt-0.5 text-xs text-gray-600">
                {formatMontant(Number(rejModal.signalement.montant || groupe.montantCotisation), groupe)}
                {tour ? ` · tour #${tour.numero}` : ''} · {rejModal.signalement.operateur || 'Money Fusion'}
              </p>
            </div>
            <Choix
              legend="Motif"
              options={[...MOTIFS_REJET, 'Autre']}
              valeur={MOTIFS_REJET.includes(rejMotif) ? rejMotif : 'Autre'}
              onChange={(v) => setRejMotif(v === 'Autre' ? '' : v)}
            />
            <div>
              <label className="label">Message transmis au membre</label>
              <textarea
                className="input min-h-20"
                maxLength={MOTIF_REJET_MAX}
                autoCapitalize="sentences"
                spellCheck={false}
                placeholder="Ex : aucun envoi reçu sur mon compte Money Fusion pour ce montant"
                value={rejMotif}
                onChange={(e) => setRejMotif(e.target.value)}
              />
            </div>
            <p className="flex items-start gap-2 text-xs text-gray-500">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Le signalement disparaît de votre file, le membre voit le motif et peut re-signaler.
              Aucune cotisation n'est enregistrée, la dette du membre reste entière.
            </p>
          </div>
        )}
      </Modal>

      {/* Responsable : encaisser d'un coup toutes les cotisations non payées. */}
      <Modal
        open={!!tout}
        onClose={() => setTout(null)}
        title="Encaisser toutes les cotisations"
        footer={
          <>
            <button className="btn btn-secondary flex-1" onClick={() => setTout(null)}>Annuler</button>
            <button className="btn btn-primary flex-1" onClick={confirmerToutEncaisser}>
              <Check size={16} /> {tout ? `Enregistrer ${restants.length}` : 'Enregistrer'}
            </button>
          </>
        }
      >
        {tout && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-brand-50 p-3 text-center">
              <p className="text-xs font-semibold text-brand-600">
                {restants.length} membre{restants.length > 1 ? 's' : ''} à payer · {formatMontant(groupe.montantCotisation, groupe)} chacun
              </p>
              <p className="mt-1 text-lg font-extrabold text-brand-700">
                {formatMontant(restants.length * Number(groupe.montantCotisation || 0), groupe)}
              </p>
              <p className="mt-1 truncate text-[11px] text-brand-600">{restants.map((l) => l.membre.nom).join(', ')}</p>
            </div>
            <div className="rounded-2xl bg-brand-50 px-3 py-2.5 text-center">
              <p className="text-xs font-semibold text-brand-600">Moyen de paiement</p>
              <p className="text-sm font-extrabold text-brand-800">Money Fusion</p>
            </div>
            <div>
              <label className="label">Date de paiement</label>
              <input className="input" type="date" value={tout.date} onChange={(e) => setTout({ ...tout, date: e.target.value })} />
            </div>
            <p className="flex items-start gap-2 text-xs text-gray-500">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              À n'utiliser que si vous avez réellement reçu ces cotisations. Les signalements en attente sont
              fermés par la même occasion, sans doublon.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
