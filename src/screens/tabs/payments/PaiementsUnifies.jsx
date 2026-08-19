import { useState } from 'react'
import { CheckCircle2, ReceiptText, Send, AlertTriangle, Smartphone, Wallet } from 'lucide-react'
import { useData } from '../../../context/DataContext'
import { useToast } from '../../../context/ToastContext'
import { haptic } from '../../../lib/haptique'
import {
  getPaiementsTour, resumeTour, STATUT, LIBELLE_STATUT,
  enregistrerPaiement, signalerPaiement, confirmerSignalement, rejeterSignalement,
  retirerPaiement, retirerSignalement,
} from '../../../lib/paiements'
import { formatMontant, formatDate } from '../../../lib/format'
import { penaliteEstimee } from '../../../lib/penalty'
import { exporterRecuPDF } from '../../../lib/export'
import { getReference } from '../../../lib/cotisation'
import Modal from '../../../components/Modal'

const MOBILE_MONEY = ['Orange Money', 'MTN MoMo', 'Moov Money', 'Wave']

const BADGE = {
  en_attente: 'bg-gray-100 text-gray-600',
  signale: 'bg-warning-50 text-warning-700',
  paye: 'bg-success-50 text-success-700',
}

function PaiementLigne({ groupe, tour, ligne, estGerant, isOwn, penalite, handlers }) {
  const { membre, statut, paiement, signalement } = ligne
  const today = new Date().toISOString().slice(0, 10)
  const enRetard = statut === STATUT.EN_ATTENTE && tour.datePrevue < today
  return (
    <div
      className={`card flex items-center gap-2 p-3.5 ${statut === STATUT.PAYE ? 'border-success-200 bg-success-50/50' : ''} ${enRetard ? 'border-l-4 border-l-danger-500' : ''}`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
            statut === STATUT.PAYE
              ? 'border-success-500 bg-success-500 text-white'
              : statut === STATUT.SIGNALE
              ? 'border-warning-400 bg-warning-400 text-white'
              : 'border-gray-300 bg-surface text-transparent'
          }`}
        >
          <CheckCircle2 size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-semibold ${
            statut === STATUT.PAYE ? 'text-success-700' : 'text-gray-600'
          }`}>
            {membre.nom}
            {isOwn && <span className="ml-1 text-[10px] font-bold text-brand-500">(vous)</span>}
          </span>
          <span className="block text-xs">
            {enRetard && <span className="mr-1.5 rounded bg-danger-500 px-1.5 py-0.5 font-semibold text-white">En retard</span>}
            <span className={`rounded px-1.5 py-0.5 font-semibold ${BADGE[statut]}`}>{LIBELLE_STATUT[statut]}</span>
            {paiement && (
              <span className="ml-1.5 text-gray-400">
                le {formatDate(paiement.datePaiement)}
                {paiement.moyenPaiement && <> · <span className="font-medium text-success-600">{paiement.moyenPaiement}</span></>}
                {paiement.modeReference && <> · réf <span className="font-medium text-success-600">{paiement.modeOperateur || paiement.moyenPaiement} {paiement.modeReference}</span></>}
              </span>
            )}
            {signalement && (
              <span className="ml-1.5 text-gray-400">
                {signalement.operateur || 'Mobile Money'}
                {signalement.reference ? ` · réf ${signalement.reference}` : ''}
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-bold text-gray-600">{formatMontant(groupe.montantCotisation, groupe)}</span>
          {penalite > 0 && (
            <span className="flex items-center justify-end gap-1 text-xs font-semibold text-danger-500">
              <AlertTriangle size={11} /> +{formatMontant(penalite, groupe)}
            </span>
          )}
        </span>
      </span>

      {/* Actions selon le rôle et le statut */}
      {estGerant && statut === STATUT.EN_ATTENTE && (
        <button className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100" onClick={() => handlers.onEnregistrer(membre)}>
          Enregistrer
        </button>
      )}
      {estGerant && statut === STATUT.SIGNALE && (
        <>
          <button className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-success-700 bg-success-50 hover:bg-success-100" onClick={() => handlers.onConfirmer(signalement)}>
            <CheckCircle2 size={13} className="mr-1 inline" />Confirmer
          </button>
          <button className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100" onClick={() => handlers.onRejeter(signalement)}>
            Rejeter
          </button>
        </>
      )}
      {estGerant && statut === STATUT.PAYE && (
        <>
          <button className="shrink-0 rounded-lg p-1.5 text-brand-600 hover:bg-brand-50" onClick={() => handlers.onReceipt(paiement)} title="Reçu PDF" aria-label={`Reçu de ${membre.nom}`}>
            <ReceiptText size={18} />
          </button>
          <button className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100" onClick={() => handlers.onRetirerPaiement(membre)}>
            Retirer
          </button>
        </>
      )}
      {!estGerant && isOwn && statut === STATUT.EN_ATTENTE && (
        <button className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100" onClick={() => handlers.onSignaler(membre)}>
          J'ai payé
        </button>
      )}
      {!estGerant && isOwn && statut === STATUT.SIGNALE && (
        <button className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100" onClick={() => handlers.onRetirerSignalement(signalement)}>
          Retirer
        </button>
      )}
      {!estGerant && statut === STATUT.PAYE && (
        <button className="shrink-0 rounded-lg p-1.5 text-brand-600 hover:bg-brand-50" onClick={() => handlers.onReceipt(paiement)} title="Reçu PDF" aria-label={`Reçu de ${membre.nom}`}>
          <ReceiptText size={18} />
        </button>
      )}
    </div>
  )
}

export default function PaiementTour({ groupe, tour, estGerant, membreConnecte }) {
  const { refresh } = useData()
  const toast = useToast()

  const lignes = getPaiementsTour(groupe, tour)
  const resume = resumeTour(groupe, tour)
  const today = new Date().toISOString().slice(0, 10)

  const [enrModal, setEnrModal] = useState(null)
  const [moyen, setMoyen] = useState('')
  const [opOperateur, setOpOperateur] = useState('')
  const [opNumero, setOpNumero] = useState('')
  const [opReference, setOpReference] = useState('')
  const [datePaiement, setDatePaiement] = useState(today)

  const [sigModal, setSigModal] = useState(null)
  const [sigOperateur, setSigOperateur] = useState('')
  const [sigReference, setSigReference] = useState('')
  const [sigEnCours, setSigEnCours] = useState(false)

  const moyens = groupe.moyensPaiement?.length ? groupe.moyensPaiement : ['Espèces']
  const reception = groupe.receptionMM && groupe.receptionMM.numero ? groupe.receptionMM : null

  const ouvrirEnregistrer = (m) => {
    setMoyen(moyens[0] || 'Espèces')
    setOpOperateur(moyens[0] || '')
    setOpNumero('')
    setOpReference('')
    setDatePaiement(today)
    setEnrModal({ membre: m })
  }
  const confirmerEnregistrer = () => {
    const details = moyen !== 'Espèces'
      ? { operateur: opOperateur || moyen, numero: opNumero.trim(), reference: opReference.trim() }
      : {}
    enregistrerPaiement(groupe, tour, enrModal.membre, groupe.montantCotisation, datePaiement, moyen, details)
    setEnrModal(null)
    refresh()
    haptic.success()
    toast.success(`Cotisation de ${enrModal.membre.nom} enregistrée`)
  }

  const ouvrirSignaler = (m) => {
    setSigOperateur(reception ? reception.operateur : 'Orange Money')
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
      signalerPaiement(groupe, tour, sigModal.membre, {
        montant: groupe.montantCotisation,
        operateur: sigOperateur,
        reference: sigReference.trim(),
        membreId: sigModal.membre.id === membreConnecte?.id ? sigModal.membre.id : undefined,
      })
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

  const handlers = {
    onEnregistrer: ouvrirEnregistrer,
    onConfirmer: (s) => {
      const res = confirmerSignalement(groupe, s.id)
      if (res === true) { refresh(); haptic.success(); toast.success(`Cotisation de ${s.nom} confirmée`) }
      else if (res === 'deja') { refresh(); toast.info(`${s.nom} a déjà payé ce tour`) }
      else toast.error('Impossible de confirmer (membre ou tour introuvable)')
    },
    onRejeter: (s) => { rejeterSignalement(groupe, s.id); refresh(); toast.info(`Signalement de ${s.nom} retiré`) },
    onRetirerPaiement: (m) => { retirerPaiement(tour, m.id); refresh(); haptic.tap(); toast.info(`Paiement de ${m.nom} retiré`) },
    onSignaler: ouvrirSignaler,
    onRetirerSignalement: (s) => { retirerSignalement(groupe, s.id); refresh(); toast.info('Signalement retiré') },
    onReceipt: (p) => { try { exporterRecuPDF(groupe.id, p.id) } catch (e) { toast.error('Reçu indisponible') } },
  }

  return (
    <div>
      {tour && (
        <div className="card mb-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-brand-50 p-3">
              <p className="text-[11px] font-semibold text-brand-500">Bénéficiaire</p>
              <p className="text-sm font-bold text-brand-800">{tour.membre?.nom || '—'}</p>
            </div>
            <div className="rounded-xl bg-success-50 p-3">
              <p className="text-[11px] font-semibold text-success-500">Pot à recevoir</p>
              <p className="text-sm font-bold text-success-700">{formatMontant(tour.montantPot || 0, groupe)}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
            <p className="text-sm font-semibold text-gray-600">
              {resume.payes} / {resume.total} payées
              {resume.signales > 0 && <span className="ml-1 text-warning-600">· {resume.signales} en attente</span>}
            </p>
            <p className={`text-sm font-bold ${resume.payes >= resume.total ? 'text-success-600' : 'text-warning-600'}`}>
              {formatMontant(resume.montantPaye, groupe)}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {lignes.map((ligne) => {
          const enRetard = ligne.statut === STATUT.EN_ATTENTE && tour.datePrevue < today
          const penalite = ligne.paiement?.penalite ?? (enRetard ? penaliteEstimee(groupe, tour) : 0)
          return (
            <PaiementLigne
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

      {/* Modal responsable : enregistrer un paiement */}
      <Modal
        open={!!enrModal}
        onClose={() => setEnrModal(null)}
        title="Enregistrer la cotisation"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEnrModal(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={confirmerEnregistrer}>Valider</button>
          </>
        }
      >
        {enrModal && (
          <div className="space-y-3">
            <div className="rounded-xl bg-brand-50 p-3 text-center">
              <p className="text-sm font-bold text-brand-800">{enrModal.membre.nom}</p>
              <p className="mt-1 text-lg font-extrabold text-brand-700">{formatMontant(groupe.montantCotisation, groupe)}</p>
            </div>
            <div>
              <label className="label">Moyen de paiement</label>
              <select className="input" value={moyen} onChange={(e) => { setMoyen(e.target.value); if (MOBILE_MONEY.includes(e.target.value)) setOpOperateur(e.target.value) }}>
                {moyens.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {moyen !== 'Espèces' && (
              <>
                <div className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2">
                  <Smartphone size={15} className="mt-0.5 shrink-0 text-brand-600" />
                  <p className="text-xs text-brand-700">Paiement mobile : enregistrez l'opérateur, le numéro et la référence pour suivre la transaction.</p>
                </div>
                <div>
                  <label className="label">Opérateur</label>
                  <select className="input" value={opOperateur} onChange={(e) => setOpOperateur(e.target.value)}>
                    {MOBILE_MONEY.map((o) => <option key={o} value={o}>{o}</option>)}
                    {!MOBILE_MONEY.includes(opOperateur) && opOperateur && <option value={opOperateur}>{opOperateur}</option>}
                  </select>
                </div>
                <div>
                  <label className="label">Numéro émetteur</label>
                  <input className="input" inputMode="tel" placeholder="Ex : 07 07 07 07 07" value={opNumero} onChange={(e) => setOpNumero(e.target.value)} />
                </div>
                <div>
                  <label className="label">Référence de la transaction</label>
                  <input className="input" placeholder="Ex : PMP3430D2X1" value={opReference} onChange={(e) => setOpReference(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <label className="label">Date de paiement</label>
              <input className="input" type="date" value={datePaiement} onChange={(e) => setDatePaiement(e.target.value)} />
            </div>
          </div>
        )}
      </Modal>

      {/* Modal membre : signaler un paiement */}
      <Modal
        open={!!sigModal}
        onClose={() => setSigModal(null)}
        title="Signaler mon paiement"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setSigModal(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={confirmerSignaler} disabled={sigEnCours}>
              <Send size={16} /> {sigEnCours ? 'Envoi…' : 'J\'ai payé'}
            </button>
          </>
        }
      >
        {sigModal && (
          <div className="space-y-3">
            <div className="rounded-xl bg-brand-50 p-3 text-center">
              <p className="text-sm font-bold text-brand-800">{sigModal.membre.nom}</p>
              <p className="mt-1 text-lg font-extrabold text-brand-700">{formatMontant(groupe.montantCotisation, groupe)}</p>
              <p className="mt-1 text-xs text-brand-600">Vers {reception ? reception.operateur + ' · ' + reception.numero : 'le responsable'}</p>
            </div>
            <div>
              <label className="label">Opérateur utilisé</label>
              <select className="input" value={sigOperateur} onChange={(e) => setSigOperateur(e.target.value)}>
                {MOBILE_MONEY.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Référence de la transaction (optionnel)</label>
              <input className="input" placeholder="Ex : PMP3430D2X1" value={sigReference} onChange={(e) => setSigReference(e.target.value)} />
            </div>
            <p className="text-xs text-gray-400">Le responsable recevra votre signalement et confirmera la cotisation dans l'application.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
