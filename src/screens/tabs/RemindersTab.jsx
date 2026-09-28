import { useState, useRef, useEffect } from 'react'
import { BellRing, MessageCircle, Smartphone, Check, AlertCircle, Send, Clock, Phone } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { getToursAvecMembre, getMembres, getPaiementMembre, getTourProchain, ajouterAuJournal } from '../../lib/db'
import { formatMontant, getSettings } from '../../lib/format'
import { buildMessageRappel, lienWhatsApp, lienSMS, envoyerRappel, ouvrirLien, telephoneValide, lienAppel } from '../../lib/remind'
import { haptic } from '../../lib/haptique'
import EmptyState from '../../components/EmptyState'

export default function RemindersTab({ group }) {
  const { refresh } = useData()

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

  if (tours.length === 0) {
    return <EmptyState icon={BellRing} title="Aucun tour" description="Générez le planning pour envoyer des rappels." />
  }

  const sansTel = cotisants.filter((m) => !m.telephone)
  const avecTel = cotisants.filter((m) => m.telephone)
  // Relance ciblée : uniquement les membres non encore réglés.
  const aRelancer = avecTel.filter((m) => !getPaiementMembre(tour?.id, m.id))

  const marquerEnvoye = (id) => setSentIds((s) => (s.includes(id) ? s : [...s, id]))

  const rappelWA = (m) => {
    const url = lienWhatsApp(m.telephone, buildMessageRappel(m, group, tour))
    ouvrirLien(url)
    marquerEnvoye(m.id)
  }
  const rappelSMS = (m) => {
    const r = envoyerRappel(m, group, tour)
    if (!r.ok) return
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
            : `Relancer les ${aRelancer.length} non payé${aRelancer.length > 1 ? 's' : ''} (WhatsApp)`}
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
    </div>
  )
}
