import { useState, useRef, useEffect } from 'react'
import { BellRing, MessageCircle, Smartphone, Check, AlertCircle, Send, Clock, Phone, Wand2, ShieldCheck, X } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { getToursAvecMembre, getMembres, getPaiementMembre, getTourProchain, ajouterAuJournal } from '../../lib/db'
import useGenerationPlanning from '../../hooks/useGenerationPlanning'
import { formatMontant, getSettings } from '../../lib/format'
import { buildMessageRappel, lienWhatsApp, lienSMS, envoyerRappel, ouvrirLien, telephoneValide, lienAppel } from '../../lib/remind'
import { statutWhatsApp, envoyerRappelsWhatsApp } from '../../lib/whatsapp'
import { haptic } from '../../lib/haptique'
import EmptyState from '../../components/EmptyState'
import Modal from '../../components/Modal'
import ConfirmationRenforcee from '../../components/ConfirmationRenforcee'

export default function RemindersTab({ group, readOnly }) {
  const { refresh } = useData()
  const toast = useToast()
  const { confirmGen, demanderGeneration, annulerGeneration, generer } = useGenerationPlanning(group)

  // Appel natif (tel:) + trace dans le journal d'audit.
  const appelerMembre = (m) => {
    const lien = lienAppel(m.telephone)
    if (!lien) return
    ouvrirLien(lien)
    ajouterAuJournal(group.id, 'appel', `Le responsable a appelé ${m.nom}`)
    refresh()
    haptic.tap()
  }
  const settings = getSettings()
  const tours = getToursAvecMembre(group.id)
  const membres = getMembres(group.id)
  const prochain = getTourProchain(group.id)
  const [tourId, setTourId] = useState(() => prochain?.id || tours.find((t) => t.statut === 'recu')?.id || null)
  const [sentIds, setSentIds] = useState([])
  const [relanceEnCours, setRelanceEnCours] = useState(false)
  const [relanceCompteur, setRelanceCompteur] = useState(0)
  const [waApercu, setWaApercu] = useState(null)
  const [waConfirme, setWaConfirme] = useState(false)
  const [waEnCours, setWaEnCours] = useState(false)
  const [waResultat, setWaResultat] = useState(null)
  const timersRef = useRef([])

  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout)
  }, [])

  const tour = tours.find((t) => t.id === Number(tourId)) || null
  const cotisants = tour
    ? group.leReceveurCotonise
      ? membres
      : membres.filter((m) => m.id !== tour.membreId)
    : []

  // Code de synchronisation : c'est lui qui relie la tontine au serveur.
  const code = group.code || group.codeUnique

  // Aperçu côté serveur du tour choisi (null = serveur injoignable ou compte
  // non connecté : le bloc d'envoi automatique reste alors masqué, et les
  // rappels continuent de partir d'ici).
  useEffect(() => {
    if (!code || !tour) { setWaApercu(null); return undefined }
    let vif = true
    statutWhatsApp(code, tour.numero).then((r) => { if (vif) setWaApercu(r) })
    return () => { vif = false }
  }, [code, tour ? tour.numero : null])

  if (tours.length === 0) {
    return (
      <div>
        <EmptyState
          icon={BellRing}
          title="Aucun tour"
          description={membres.length
            ? 'Générez le planning : un tour par membre, et les rappels suivront les échéances.'
            : "Ajoutez des membres dans l'onglet Membres, puis générez le planning."}
          action={!readOnly && membres.length > 0 && (
            <button className="btn btn-primary" onClick={demanderGeneration}>
              <Wand2 size={16} /> Générer le planning
            </button>
          )}
        />
        <Modal
          open={confirmGen}
          onClose={annulerGeneration}
          title="Générer le planning"
          footer={
            <>
              <button className="btn btn-secondary" onClick={annulerGeneration}>Annuler</button>
              <button className="btn btn-primary" onClick={generer}><Wand2 size={16} /> Générer</button>
            </>
          }
        >
          <p className="text-sm text-gray-600">
            Un tour sera créé pour chaque membre, espacé de {group.periodeJours} jour(s). Les rappels seront
            ensuite calés sur ces échéances.
          </p>
        </Modal>
      </div>
    )
  }

  const sansTel = cotisants.filter((m) => !m.telephone)
  const avecTel = cotisants.filter((m) => m.telephone)
  // Relance ciblée : uniquement les membres non encore réglés.
  const aRelancer = avecTel.filter((m) => !getPaiementMembre(tour?.id, m.id))

  // Aperçu serveur : joignables et écartés (avec leur raison), tels que le
  // serveur les voit pour le tour choisi.
  const waJoignables = (waApercu && waApercu.aRelancer ? waApercu.aRelancer : []).filter((x) => x.joignable)
  const waEcartes = (waApercu && waApercu.aRelancer ? waApercu.aRelancer : []).filter((x) => !x.joignable)

  const marquerEnvoye = (id) => setSentIds((s) => (s.includes(id) ? s : [...s, id]))

  const rappelWA = (m) => {
    const url = lienWhatsApp(m.telephone, buildMessageRappel(m, group, tour))
    ouvrirLien(url)
    marquerEnvoye(m.id)
  }
  const rappelSMS = (m) => {
    if (!telephoneValide(m.telephone)) {
      toast.error('Numéro de téléphone invalide : rappel SMS impossible.')
      return
    }
    const r = envoyerRappel(m, group, tour)
    if (!r.ok) {
      toast.error(r.raison || 'Rappel SMS impossible.')
      return
    }
    // via === 'whatsapp' signifie en réalité « aucune passerelle SMS configurée » :
    // le serveur n'a rien envoyé, le SMS doit donc partir de l'appli SMS du téléphone.
    if (r.via === 'whatsapp') {
      ouvrirLien(lienSMS(m.telephone, buildMessageRappel(m, group, tour)))
    }
    marquerEnvoye(m.id)
  }

  // Relance groupée chronométrée : ouvre un rappel WhatsApp à la fois
  // (espacement 1 s) pour les membres non payés, puis affiche le bilan.
  const relancerTout = () => {
    const cible = aRelancer
    if (!cible.length || relanceEnCours) return
    setRelanceEnCours(true)
    setRelanceCompteur(0)
    const total = cible.length
    cible.forEach((m, i) => {
      const timer = setTimeout(() => {
        const url = lienWhatsApp(m.telephone, buildMessageRappel(m, group, tour))
        ouvrirLien(url)
        marquerEnvoye(m.id)
        setRelanceCompteur(i + 1)
        if (i === total - 1) setRelanceEnCours(false)
      }, i * 1000)
      timersRef.current.push(timer)
    })
  }

  // Envoi par le serveur : les rappels du tour choisi partent du numéro
  // professionnel de la tontine, sans ouvrir WhatsApp sur ce téléphone.
  const lancerEnvoiServeur = async () => {
    if (waEnCours || !code || !waApercu || !waApercu.tour) return
    setWaEnCours(true)
    const tourNumero = waApercu.tour.numero
    const r = await envoyerRappelsWhatsApp(code, tourNumero)
    setWaEnCours(false)
    setWaResultat(r)
    const nb = (r && r.envoyes && r.envoyes.length) || 0
    if (nb) {
      ajouterAuJournal(group.id, 'rappel', `${nb} rappel${nb > 1 ? 's' : ''} WhatsApp envoyé${nb > 1 ? 's' : ''} par le serveur (tour #${tourNumero})`)
      refresh()
      toast.success(`${nb} rappel${nb > 1 ? 's' : ''} WhatsApp envoyé${nb > 1 ? 's' : ''}`)
    } else {
      toast.error((r && r.raison) || 'Aucun rappel envoyé.')
    }
  }

  const messageConfirmationWA = waApercu && waApercu.tour
    ? `${waJoignables.length} membre${waJoignables.length > 1 ? 's' : ''} non à jour du tour #${waApercu.tour.numero} recevra${waJoignables.length > 1 ? 'ont' : ''} un rappel WhatsApp envoyé par le serveur, au nom de la tontine. Les numéros concernés sont transmis à WhatsApp (Meta) pour ce seul envoi.`
    : 'Les rappels WhatsApp seront envoyés par le serveur de la tontine.'

  return (
    <div>
      <div className="card mb-4 p-4">
        <label className="label">Tour à rappeler</label>
        <select className="input" value={tourId || ''} onChange={(e) => setTourId(e.target.value)}>
          {tours.map((t) => (
            <option key={t.id} value={t.id}>
              Tour #{t.numero} — {t.membre?.nom} ({t.statut === 'recu' ? 'reçu' : t.datePrevue})
            </option>
          ))}
        </select>
        <button
          className="btn btn-primary mt-3 w-full"
          onClick={relancerTout}
          disabled={!aRelancer.length || relanceEnCours}
        >
          {relanceEnCours ? <Clock size={16} /> : <Send size={16} />}
          {relanceEnCours
            ? `Relance en cours… (${relanceCompteur}/${aRelancer.length})`
            : `Relancer les ${aRelancer.length} non payé${aRelancer.length > 1 ? 's' : ''} (WhatsApp, ce téléphone)`}
        </button>
        {aRelancer.length < avecTel.length && !relanceEnCours && (
          <p className="mt-2 text-center text-xs text-gray-400">
            {avecTel.length - aRelancer.length} membre{(avecTel.length - aRelancer.length) > 1 ? 's' : ''} déjà réglé{(avecTel.length - aRelancer.length) > 1 ? 's' : ''} : non inclus.
          </p>
        )}
        {settings.twilioSid ? (
          <p className="mt-2 text-center text-xs text-success-600">SMS Twilio configuré ✓</p>
        ) : (
          <p className="mt-2 text-center text-xs text-gray-400">SMS envoyé via l'application SMS (WhatsApp recommandé)</p>
        )}
      </div>

      {tour && (
        <div className="mb-4 rounded-2xl bg-surface-muted p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Aperçu du message</p>
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm text-gray-600">
            {buildMessageRappel({ nom: 'Membre' }, group, tour)}
          </p>
        </div>
      )}

      {!readOnly && code && waApercu && (
        <div className="card mb-4 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="shrink-0 text-brand-600" />
            <p className="text-sm font-semibold text-gray-800">Envoi automatique par le serveur</p>
          </div>
          {!waApercu.configure ? (
            <p className="mt-2 text-xs text-gray-400">
              Pas encore activé pour cette tontine : les rappels continuent de partir d'ici, via WhatsApp ou l'application SMS.
            </p>
          ) : !waApercu.tour ? (
            <p className="mt-2 text-xs text-gray-400">
              Aucun tour à rappeler sur le serveur : synchronisez la tontine, puis rouvrez cet onglet.
            </p>
          ) : (
            <>
              <p className="mt-2 text-xs text-gray-500">
                Tour #{waApercu.tour.numero} · {waJoignables.length} membre{waJoignables.length > 1 ? 's' : ''} non à jour :
                le message part du numéro professionnel, sans ouvrir WhatsApp sur ce téléphone.
              </p>
              {waJoignables.length > 0 && (
                <p className="mt-1 text-xs text-gray-400">{waJoignables.map((x) => x.nom).join(', ')}</p>
              )}
              {waEcartes.map((x) => (
                <p key={x.membre} className="mt-1 text-xs text-warning-600">{x.nom} : {x.raison}</p>
              ))}
              <button
                className="btn btn-primary mt-3 w-full"
                onClick={() => setWaConfirme(true)}
                disabled={!waJoignables.length || waEnCours}
              >
                {waEnCours ? <Clock size={16} /> : <Send size={16} />}
                {waEnCours ? 'Envoi en cours…' : `Envoyer les rappels par le serveur (${waJoignables.length})`}
              </button>
              <p className="mt-2 text-center text-[11px] text-gray-400">
                Les numéros des membres relancés sont transmis à WhatsApp (Meta) pour ce seul envoi.
              </p>
            </>
          )}
        </div>
      )}

      {waResultat && (
        <div className="card mb-4 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-800">
              {waResultat.envoyes && waResultat.envoyes.length
                ? `${waResultat.envoyes.length} rappel${waResultat.envoyes.length > 1 ? 's' : ''} envoyé${waResultat.envoyes.length > 1 ? 's' : ''}`
                : 'Aucun rappel envoyé'}
            </p>
            <button className="btn btn-icon !h-7 !w-7 shrink-0" onClick={() => setWaResultat(null)} aria-label="Fermer le bilan">
              <X size={14} />
            </button>
          </div>
          {(waResultat.envoyes || []).map((x) => (
            <p key={'e' + x.membre} className="mt-1 flex items-center gap-1.5 text-xs text-success-600">
              <Check size={12} /> {x.nom}
            </p>
          ))}
          {(waResultat.ignores || []).map((x) => (
            <p key={'i' + x.membre} className="mt-1 text-xs text-gray-400">{x.nom} — {x.raison}</p>
          ))}
          {(!waResultat.envoyes || !waResultat.envoyes.length) && waResultat.raison && (
            <p className="mt-1 text-xs text-gray-500">{waResultat.raison}</p>
          )}
        </div>
      )}

      {sansTel.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-warning-200 bg-warning-50 p-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning-500" />
          <p className="text-xs text-warning-700">
            {sansTel.length} membre{sansTel.length > 1 ? 's' : ''} sans numéro de téléphone ({sansTel.map((m) => m.nom).join(', ')}).
          </p>
        </div>
      )}

      <div className="space-y-2">
        {cotisants.map((m) => {
          const paye = !!getPaiementMembre(tour?.id, m.id)
          const envoye = sentIds.includes(m.id)
          return (
            <div className="card p-4" key={m.id}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-800">{m.nom}</p>
                  <p className="text-xs text-gray-400">{m.telephone || 'Pas de numéro'}</p>
                </div>
                {paye ? (
                  <span className="badge bg-success-100 text-success-600"><Check size={11} /> Payé</span>
                ) : envoye ? (
                  <span className="badge bg-brand-100 text-brand-700">Rappel envoyé</span>
                ) : (
                  <span className="flex shrink-0 gap-2">
                    <button className="btn btn-primary !py-1.5 !px-3 text-xs" disabled={!m.telephone} onClick={() => rappelWA(m)}>
                      <MessageCircle size={14} /> WhatsApp
                    </button>
                    <button className="btn btn-secondary !py-1.5 !px-3 text-xs" disabled={!m.telephone} onClick={() => rappelSMS(m)}>
                      <Smartphone size={14} /> SMS
                    </button>
                    <button className="btn btn-ghost !py-1.5 !px-3 text-xs" disabled={!telephoneValide(m.telephone)} onClick={() => appelerMembre(m)}>
                      <Phone size={14} /> Appeler
                    </button>
                  </span>
                )}
              </div>
              {!paye && m.telephone && (
                <p className="mt-2 text-xs text-gray-400">
                  Montant attendu : <span className="font-semibold text-gray-600">{formatMontant(group.montantCotisation, group)}</span>
                  {' · '}Échéance : {tour?.datePrevue}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <ConfirmationRenforcee
        open={waConfirme}
        onClose={() => setWaConfirme(false)}
        titre="Envoyer les rappels WhatsApp"
        message={messageConfirmationWA}
        onConfirmer={lancerEnvoiServeur}
      />
    </div>
  )
}
