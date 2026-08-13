import { useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, CalendarDays, ReceiptText, Smartphone, Copy, Wallet, Send, ExternalLink } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { haptic } from '../../lib/haptique'
import { getToursAvecMembre, getMembres, getCotisationsByTour, payerCotisation, enleverPaiement, marquerTourRecu, getPaiementMembre, getPendingPaiements, signalerPaiementMembre, confirmerPaiementMembre, annulerPaiementMembre } from '../../lib/db'
import { formatMontant, formatDate } from '../../lib/format'
import { penaliteEstimee } from '../../lib/penalty'
import { exporterRecuPDF } from '../../lib/export'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import CompteVirtuel from './CompteVirtuel'
import Tresorerie from './Tresorerie'

const MOBILE_MONEY = ['Orange Money', 'MTN MoMo', 'Moov Money', 'Wave']

// Ouvre l'appli Mobile Money de l'opérateur via un intent Android ; si
// l'appli n'est pas installée, repli sur le store (browser_fallback_url).
const APPLIS_MM = {
  'Orange Money': { pkg: 'com.orange.mobile.orangemoney', store: 'https://play.google.com/store/apps/details?id=com.orange.mobile.orangemoney' },
  'MTN MoMo': { pkg: 'com.mtn.momo', store: 'https://play.google.com/store/search?q=MTN%20MoMo%20S%C3%A9n%C3%A9gal' },
  'Moov Money': { pkg: 'com.moov.money', store: 'https://play.google.com/store/search?q=Moov%20Money%20S%C3%A9n%C3%A9gal' },
  'Wave': { pkg: 'com.wave.personal', store: 'https://play.google.com/store/apps/details?id=com.wave.personal' },
  'Free Money': { pkg: 'com.freemoney', store: 'https://play.google.com/store/search?q=Free%20Money%20S%C3%A9n%C3%A9gal' },
}

export default function PaymentsTab({ group, readOnly }) {
  const { refresh } = useData()
  const toast = useToast()
  const tours = getToursAvecMembre(group.id)
  const membres = getMembres(group.id)
  const actifs = tours.filter((t) => t.statut === 'en_attente' || t.statut === 'recu')

  const [tourId, setTourId] = useState(() => actifs[0]?.id || null)
  const [datePaiement, setDatePaiement] = useState(() => new Date().toISOString().slice(0, 10))
  const [confirmPot, setConfirmPot] = useState(false)
  const [paiementModal, setPaiementModal] = useState(null)
  const [moyenChoisi, setMoyenChoisi] = useState('')
  const [modeOperateur, setModeOperateur] = useState('')
  const [modeNumero, setModeNumero] = useState('')
  const [modeReference, setModeReference] = useState('')
  const [jaiPayeModal, setJaiPayeModal] = useState(null)
  const [jaiPayeOperateur, setJaiPayeOperateur] = useState('')
  const [jaiPayeReference, setJaiPayeReference] = useState('')
  const [jaiPayeEnCours, setJaiPayeEnCours] = useState(false)

  const moyens = group.moyensPaiement?.length ? group.moyensPaiement : ['Espèces']
  const reception = group.receptionMM && group.receptionMM.numero ? group.receptionMM : null

  const { utilisateur } = useAuth()
  const uid = utilisateur ? utilisateur.uid : null
  const estGerant = !!uid && (group.proprietaire === uid || !!(group.coGerants && group.coGerants[uid]))

  const tour = actifs.find((t) => t.id === Number(tourId)) || null
  const cotisations = tour ? getCotisationsByTour(tour.id) : []

  const lignes = useMemo(() => {
    if (!tour) return []
    const liste = group.leReceveurCotonise ? membres : membres.filter((m) => m.id !== tour.membreId)
    return liste.map((m) => ({ membre: m, paiement: getPaiementMembre(tour.id, m.id) }))
  }, [tour, membres, tourId, cotisations])

  const pending = getPendingPaiements(group.id)
  const pendingByNom = {}
  for (const p of pending) {
    const cle = (p.nom || '').trim().toLowerCase()
    if (cle) pendingByNom[cle] = p
  }

  const payes = cotisations.filter((c) => c.statut === 'paye')
  const totalPot = tour?.montantPot || 0

  const ouvrirPaiement = (m) => {
    setMoyenChoisi(moyens[0] || 'Espèces')
    setModeOperateur(moyens[0] || '')
    setModeNumero('')
    setModeReference('')
    setPaiementModal({ membre: m })
  }

  const confirmerPaiement = () => {
    const details =
      moyenChoisi !== 'Espèces'
        ? {
            operateur: modeOperateur || moyenChoisi,
            numero: modeNumero.trim(),
            reference: modeReference.trim(),
          }
        : {}
    payerCotisation(group.id, tour.id, paiementModal.membre.id, group.montantCotisation, datePaiement, moyenChoisi, details)
    setPaiementModal(null)
    refresh()
    haptic.success()
    toast.success(`Cotisation de ${paiementModal.membre.nom} enregistrée`)
  }

  const retirerPaiement = (m) => {
    const existing = getPaiementMembre(tour.id, m.id)
    if (existing) {
      enleverPaiement(existing.id)
      refresh()
      haptic.tap()
      toast.info(`Paiement de ${m.nom} retiré`)
    }
  }

  const ouvrirJaiPaye = (m) => {
    setJaiPayeOperateur(reception ? reception.operateur : MOBILE_MONEY[0])
    setJaiPayeReference('')
    setJaiPayeEnCours(false)
    setJaiPayeModal({ membre: m })
  }

  const soumettreJaiPaye = () => {
    if (!jaiPayeModal) return
    setJaiPayeEnCours(true)
    try {
      signalerPaiementMembre(group.id, {
        nom: jaiPayeModal.membre.nom,
        montant: group.montantCotisation,
        operateur: jaiPayeOperateur,
        numeroEmetteur: '',
        reference: jaiPayeReference.trim(),
      })
      setJaiPayeModal(null)
      refresh()
      haptic.success()
      toast.success('Paiement signalé — en attente de confirmation du responsable')
    } catch (e) {
      toast.error((e && e.message) || 'Envoi impossible')
    } finally {
      setJaiPayeEnCours(false)
    }
  }

  const copierNumero = async (num) => {
    try {
      await navigator.clipboard.writeText(String(num).replace(/\s+/g, ''))
      toast.success('Numéro copié')
    } catch {
      toast.error('Copie impossible')
    }
  }

  const ouvrirAppliMM = (operateur) => {
    const info = APPLIS_MM[operateur]
    if (!info) return
    const intent = `intent://#Intent;package=${info.pkg};scheme=https;S.browser_fallback_url=${encodeURIComponent(info.store)};end`
    try {
      const a = document.createElement('a')
      a.href = intent
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      window.open(info.store, '_blank')
    }
  }

  const confirmerSignalement = (p) => {
    const res = confirmerPaiementMembre(group.id, p.id)
    if (res === true) {
      refresh()
      haptic.success()
      toast.success(`Cotisation de ${p.nom} confirmée`)
    } else if (res === 'deja') {
      refresh()
      toast.info(`${p.nom} a déjà payé ce tour`)
    } else {
      toast.error('Impossible de confirmer (membre ou tour introuvable)')
    }
  }

  if (tours.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Aucun tour"
        description="Générez le planning dans l'onglet Tours pour commencer à enregistrer les cotisations."
      />
    )
  }

  return (
    <div>
      {readOnly && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-info-200 bg-info-50 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-info-500" />
          <p className="text-xs text-info-700">Lecture seule : cotisations gérées par le responsable.</p>
        </div>
      )}

      {reception && (
        <div className="card mb-4 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Wallet size={16} className="text-brand-600" />
            <p className="text-sm font-bold text-gray-800">Comment payer votre cotisation</p>
          </div>
          <p className="text-xs text-gray-500">
            Envoyez <span className="font-semibold text-gray-700">{formatMontant(group.montantCotisation, group)}</span> via{' '}
            <span className="font-semibold text-gray-700">{reception.operateur}</span> au numéro du responsable, puis signalez votre paiement.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5">
            <Smartphone size={16} className="shrink-0 text-brand-600" />
            <span className="flex-1 truncate text-sm font-bold text-brand-800">{reception.numero}</span>
            <button className="btn btn-secondary !px-2.5 !py-1.5 text-xs" onClick={() => copierNumero(reception.numero)}>
              <Copy size={14} /> Copier
            </button>
            {APPLIS_MM[reception.operateur] && (
              <button className="btn btn-secondary !px-2.5 !py-1.5 text-xs" onClick={() => ouvrirAppliMM(reception.operateur)}>
                <ExternalLink size={14} /> Ouvrir l'appli
              </button>
            )}
          </div>
          {reception.instructions && (
            <p className="mt-2 text-xs text-gray-500">{reception.instructions}</p>
          )}
        </div>
      )}

      {group.codeUnique && <CompteVirtuel group={group} />}
      {estGerant && <Tresorerie group={group} uid={uid} estGerant={estGerant} />}

      <div className="card mb-4 p-4">
        <label className="label">Tour à régler</label>
        <select className="input" value={tourId || ''} onChange={(e) => setTourId(e.target.value)}>
          {actifs.map((t) => (
            <option key={t.id} value={t.id}>
              Tour #{t.numero} — {t.membre?.nom} ({t.statut === 'recu' ? 'reçu' : formatDate(t.datePrevue)})
            </option>
          ))}
        </select>

        {tour && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-[11px] font-semibold text-brand-500">Bénéficiaire</p>
                <p className="text-sm font-bold text-brand-800">{tour.membre?.nom}</p>
              </div>
              <div className="rounded-xl bg-success-50 p-3">
                <p className="text-[11px] font-semibold text-success-500">Pot à recevoir</p>
                <p className="text-sm font-bold text-success-700">{formatMontant(totalPot, group)}</p>
              </div>
            </div>
            <div className="mt-3">
              <label className="label">Date de paiement</label>
              <input className="input" type="date" value={datePaiement} onChange={(e) => setDatePaiement(e.target.value)} disabled={readOnly} />
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
              <p className="text-sm font-semibold text-gray-600">
                {payes.length} / {lignes.length} cotisations payées
              </p>
              <p className={`text-sm font-bold ${payes.length >= lignes.length ? 'text-success-600' : 'text-warning-600'}`}>
                {formatMontant(payes.reduce((s, c) => s + Number(c.montant || 0), 0), group)}
              </p>
            </div>
            {!readOnly && payes.length >= lignes.length && tour.statut === 'en_attente' && (
              <button className="btn btn-primary mt-3 w-full" onClick={() => setConfirmPot(true)}>
                <CheckCircle2 size={16} /> Pot complet — marquer reçu
              </button>
            )}
          </>
        )}
      </div>

      {!readOnly && pending.length > 0 && (
        <div className="card mb-4 p-4">
          <p className="mb-2 text-sm font-bold text-gray-800">Paiements signalés par les membres</p>
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-xl bg-warning-50 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800">{p.nom}</p>
                  <p className="text-xs text-gray-500">
                    {p.operateur || 'Mobile Money'}
                    {p.reference ? ` · réf ${p.reference}` : ''}
                    {p.montant ? ` · ${formatMontant(p.montant, group)}` : ''}
                  </p>
                </div>
                <button className="btn btn-primary !px-2.5 !py-1.5 text-xs" onClick={() => confirmerSignalement(p)}>
                  <CheckCircle2 size={14} /> Confirmer
                </button>
                <button className="btn btn-secondary !px-2.5 !py-1.5 text-xs" onClick={() => { annulerPaiementMembre(group.id, p.id); refresh() }}>
                  Retirer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {lignes.map(({ membre, paiement }) => {
          const enRetard = !paiement && tour.datePrevue < datePaiement
          const penalite = paiement?.penalite ?? (enRetard ? penaliteEstimee(group, tour) : 0)
          const pend = readOnly && !paiement ? pendingByNom[membre.nom?.trim().toLowerCase()] : null
          return (
            <div
              key={membre.id}
              className={`card flex items-center gap-2 p-3.5 ${paiement ? 'border-success-200 bg-success-50/50' : ''}`}
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => { if (!readOnly) paiement ? retirerPaiement(membre) : ouvrirPaiement(membre) }}
                aria-label={paiement ? `Retirer le paiement de ${membre.nom}` : `Enregistrer la cotisation de ${membre.nom}`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                    paiement ? 'border-success-500 bg-success-500 text-white' : 'border-gray-300 bg-surface text-transparent'
                  }`}
                >
                  <CheckCircle2 size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-semibold ${paiement ? 'text-success-700' : 'text-gray-600'}`}>{membre.nom}</span>
                  <span className="block text-xs text-gray-400">
                    {paiement ? (
                      <>
                        Payé le {formatDate(paiement.datePaiement)}
                        {paiement.moyenPaiement && <> · <span className="font-medium text-success-600">{paiement.moyenPaiement}</span></>}
                        {paiement.modeReference && (
                          <>
                            {' · '}réf{' '}
                            <span className="font-medium text-success-600">
                              {paiement.modeOperateur || paiement.moyenPaiement} {paiement.modeReference}
                            </span>
                          </>
                        )}
                      </>
                    ) : pend ? (
                      <span className="font-medium text-warning-600">En attente de confirmation</span>
                    ) : (
                      'En attente de paiement'
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold text-gray-600">{formatMontant(group.montantCotisation, group)}</span>
                  {penalite > 0 && (
                    <span className="flex items-center justify-end gap-1 text-xs font-semibold text-danger-500">
                      <AlertTriangle size={11} /> +{formatMontant(penalite, group)} pénalité
                    </span>
                  )}
                </span>
              </button>
              {paiement && (
                <button
                  className="shrink-0 rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
                  onClick={() => exporterRecuPDF(group.id, paiement.id)}
                  aria-label={`Reçu de paiement de ${membre.nom}`}
                  title="Reçu PDF"
                >
                  <ReceiptText size={18} />
                </button>
              )}
              {readOnly && !paiement && reception && !pend && (
                <button
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100"
                  onClick={() => ouvrirJaiPaye(membre)}
                >
                  J'ai payé
                </button>
              )}
            </div>
          )
        })}
      </div>

      <Modal
        open={confirmPot && !!tour}
        onClose={() => setConfirmPot(false)}
        title="Marquer le pot comme reçu ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmPot(false)}>Annuler</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                marquerTourRecu(tour.id, datePaiement)
                setConfirmPot(false)
                refresh()
                haptic.success()
                toast.success(`Pot du tour #${tour.numero} reçu par ${tour.membre?.nom}`)
              }}
            >
              <CheckCircle2 size={16} /> Confirmer
            </button>
          </>
        }
      >
        {tour && (
          <p className="text-sm text-gray-600">
            Toutes les cotisations du tour #{tour.numero} sont payées. « {tour.membre?.nom} » reçoit{' '}
            <span className="font-semibold">{formatMontant(totalPot, group)}</span>.
          </p>
        )}
      </Modal>

      <Modal
        open={!!paiementModal}
        onClose={() => setPaiementModal(null)}
        title="Enregistrer la cotisation"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPaiementModal(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={confirmerPaiement}>
              <CheckCircle2 size={16} /> Valider
            </button>
          </>
        }
      >
        {paiementModal && (
          <div className="space-y-3">
            <div className="rounded-xl bg-brand-50 p-3 text-center">
              <p className="text-sm font-bold text-brand-800">{paiementModal.membre.nom}</p>
              <p className="mt-1 text-lg font-extrabold text-brand-700">{formatMontant(group.montantCotisation, group)}</p>
            </div>
            <div>
              <label className="label">Moyen de paiement</label>
              <select
                className="input"
                value={moyenChoisi}
                onChange={(e) => {
                  setMoyenChoisi(e.target.value)
                  if (MOBILE_MONEY.includes(e.target.value)) setModeOperateur(e.target.value)
                }}
              >
                {moyens.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            {moyenChoisi !== 'Espèces' && (
              <>
                <div className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2">
                  <Smartphone size={15} className="mt-0.5 shrink-0 text-brand-600" />
                  <p className="text-xs text-brand-700">
                    Paiement mobile : enregistrez l'opérateur, le numéro et la référence pour pouvoir
                    suivre et retrouver la transaction plus tard.
                  </p>
                </div>
                <div>
                  <label className="label">Opérateur</label>
                  <select className="input" value={modeOperateur} onChange={(e) => setModeOperateur(e.target.value)}>
                    {MOBILE_MONEY.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                    {!MOBILE_MONEY.includes(modeOperateur) && modeOperateur && (
                      <option value={modeOperateur}>{modeOperateur}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="label">Numéro émetteur</label>
                  <input className="input" inputMode="tel" placeholder="Ex : 07 07 07 07 07" value={modeNumero} onChange={(e) => setModeNumero(e.target.value)} />
                </div>
                <div>
                  <label className="label">Référence de la transaction</label>
                  <input className="input" placeholder="Ex : PMP3430D2X1" value={modeReference} onChange={(e) => setModeReference(e.target.value)} />
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!jaiPayeModal}
        onClose={() => setJaiPayeModal(null)}
        title="Signaler mon paiement"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setJaiPayeModal(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={soumettreJaiPaye} disabled={jaiPayeEnCours}>
              <Send size={16} /> {jaiPayeEnCours ? 'Envoi…' : 'J\'ai payé'}
            </button>
          </>
        }
      >
        {jaiPayeModal && (
          <div className="space-y-3">
            <div className="rounded-xl bg-brand-50 p-3 text-center">
              <p className="text-sm font-bold text-brand-800">{jaiPayeModal.membre.nom}</p>
              <p className="mt-1 text-lg font-extrabold text-brand-700">{formatMontant(group.montantCotisation, group)}</p>
              <p className="mt-1 text-xs text-brand-600">
                Vers {reception ? reception.operateur + ' · ' + reception.numero : 'le responsable'}
              </p>
            </div>
            <div>
              <label className="label">Opérateur utilisé</label>
              <select className="input" value={jaiPayeOperateur} onChange={(e) => setJaiPayeOperateur(e.target.value)}>
                {MOBILE_MONEY.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Référence de la transaction (optionnel)</label>
              <input className="input" placeholder="Ex : PMP3430D2X1" value={jaiPayeReference} onChange={(e) => setJaiPayeReference(e.target.value)} />
            </div>
            <p className="text-xs text-gray-400">
              Le responsable recevra votre signalement et confirmera la cotisation dans l'application.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
