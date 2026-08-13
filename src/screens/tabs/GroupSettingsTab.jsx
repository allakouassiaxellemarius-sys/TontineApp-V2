import { useState, useRef, useEffect } from 'react'
import {
  Save, FileText, Download, ShieldCheck, History, Users, CalendarDays,
  Share2, Copy, Check, MessageCircle, RefreshCw, Wallet, Cloud, CloudOff,
  Wifi, Send, Clock, ExternalLink, ChevronDown, Coins, Crown, CalendarCheck, Archive,
} from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { ensureCodeUnique, getMembres, getBilanAnnee, archiverAnnee, estResponsable } from '../../lib/db'
import { activerSynchro, desactiverSynchro } from '../../lib/syncEngine'
import { firebaseConfigure } from '../../lib/firebaseConfig'
import { exporterBilanPDF, exporterMembresCSV, exporterToursCSV, exporterHistoriqueCSV, partagerQRInvitation } from '../../lib/export'
import { exporterGroupeExcel } from '../../lib/excel'
import { normaliserTelephone, lienWhatsApp, buildMessageInvitationGroupe, ouvrirLien } from '../../lib/remind'
import { formatMontant } from '../../lib/format'
import Field from '../../components/Field'

const MOYENS_DISPO = ['Espèces', 'Orange Money', 'MTN MoMo', 'Moov Money', 'Wave']

function Section({ icon: Icon, title, subtitle, children, ouvert, onToggle }) {
  return (
    <div className="card mb-3 overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-gray-800">{title}</span>
          {subtitle && <span className="block truncate text-xs text-gray-400">{subtitle}</span>}
        </span>
        <ChevronDown size={18} className={`shrink-0 text-gray-300 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>
      {ouvert && <div className="border-t border-gray-100 px-4 py-4">{children}</div>}
    </div>
  )
}

export default function GroupSettingsTab({ group, onUpdate, readOnly }) {
  const { refresh } = useData()
  const toast = useToast()
  const { utilisateur } = useAuth()
  const [form, setForm] = useState({
    nom: group.nom,
    montantCotisation: group.montantCotisation,
    periodeJours: group.periodeJours,
    deviseSymbole: group.deviseSymbole,
    devisePosition: group.devisePosition,
    leReceveurCotonise: group.leReceveurCotonise,
    penalitePctParJour: group.penalitePctParJour,
    penalitePlafond: group.penalitePlafond,
    dateDebut: group.dateDebut,
    membresMin: group.membresMin || 1,
    membresMax: group.membresMax || '',
    moyensPaiement: group.moyensPaiement?.length ? group.moyensPaiement : ['Espèces'],
    receptionMM: group.receptionMM || { operateur: 'Orange Money', numero: '', instructions: '' },
  })
  const [ouvert, setOuvert] = useState({ infos: true })
  const [codeCourt, setCodeCourt] = useState(group.codeUnique || '')
  const [shareCopie, setShareCopie] = useState(false)
  const [lienGroupe, setLienGroupe] = useState(group.whatsappLien || '')
  const [lienEnregistre, setLienEnregistre] = useState(false)
  const [lienCopie, setLienCopie] = useState(false)
  const [numsCopie, setNumsCopie] = useState(false)
  const [msgCopie, setMsgCopie] = useState(false)
  const [envoyerInvitesEnCours, setEnvoyerInvitesEnCours] = useState(false)
  const [envoyerInvitesCompteur, setEnvoyerInvitesCompteur] = useState(0)
  const [qrEnCours, setQrEnCours] = useState(false)
  const [anneeBilan, setAnneeBilan] = useState(new Date().getFullYear())
  const [archivageEnCours, setArchivageEnCours] = useState(false)
  const timersRef = useRef([])

  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout)
  }, [])

  const membres = getMembres(group.id)
  const membresAvecTel = membres.filter((m) => m.telephone)
  const membresSansTel = membres.filter((m) => !m.telephone)
  const bilanAnnee = getBilanAnnee(group.id, anneeBilan)
  const coGerants = (group.coGerants && typeof group.coGerants === 'object') ? group.coGerants : {}
  const estCoGerant = utilisateur ? coGerants[utilisateur.uid] || estResponsable(group.id, utilisateur.uid) : false
  const archives = Array.isArray(group.archives) ? group.archives : []

  const cloreAnnee = () => {
    if (archivageEnCours) return
    setArchivageEnCours(true)
    archiverAnnee(group.id, anneeBilan)
    refresh()
    toast.success(`Exercice ${anneeBilan} clôturé, bilan archivé`)
    setTimeout(() => setArchivageEnCours(false), 1500)
  }

  const toggleSection = (id) => setOuvert((o) => ({ ...o, [id]: !o[id] }))

  const copierTexte = async (txt) => {
    let ok = false
    try {
      await navigator.clipboard.writeText(txt)
      ok = true
    } catch {}
    if (!ok) {
      try {
        const ta = document.createElement('textarea')
        ta.value = txt
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {}
    }
    return ok
  }

  const copierNumeros = async () => {
    const nums = membresAvecTel.map((m) => normaliserTelephone(m.telephone)).filter(Boolean)
    setNumsCopie(await copierTexte(nums.join('\n')))
    setTimeout(() => setNumsCopie(false), 2500)
  }

  const copierInvitation = async () => {
    const code = codeCourt || ensureCodeUnique(group.id) || ''
    const txt = buildMessageInvitationGroupe(group, { lien: group.whatsappLien, code })
    setMsgCopie(await copierTexte(txt))
    setTimeout(() => setMsgCopie(false), 2500)
  }

  const copierLien = async () => {
    setLienCopie(await copierTexte(group.whatsappLien))
    setTimeout(() => setLienCopie(false), 2500)
  }

  const enregistrerLien = () => {
    if (!lienGroupe.trim()) return
    onUpdate({ whatsappLien: lienGroupe.trim() })
    setLienEnregistre(true)
    setTimeout(() => setLienEnregistre(false), 2000)
  }

  // Ouvre le lien d'invitation WhatsApp pour chaque membre, un à la fois.
  const envoyerInvitations = () => {
    const cible = membresAvecTel
    if (!cible.length || envoyerInvitesEnCours) return
    setEnvoyerInvitesEnCours(true)
    setEnvoyerInvitesCompteur(0)
    const total = cible.length
    const msg = buildMessageInvitationGroupe(group, { lien: group.whatsappLien })
    cible.forEach((m, i) => {
      const timer = setTimeout(() => {
        ouvrirLien(lienWhatsApp(m.telephone, msg))
        setEnvoyerInvitesCompteur(i + 1)
        if (i === total - 1) setEnvoyerInvitesEnCours(false)
      }, i * 1000)
      timersRef.current.push(timer)
    })
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const toggleMoyen = (m) =>
    setForm((f) => ({
      ...f,
      moyensPaiement: f.moyensPaiement.includes(m)
        ? f.moyensPaiement.filter((x) => x !== m)
        : [...f.moyensPaiement, m],
    }))
  const save = () => {
    const min = Math.max(1, Number(form.membresMin) || 1)
    const max = Number(form.membresMax) || 0
    if (max > 0 && min >= max) {
      toast.error('Le nombre minimum doit être inférieur au maximum')
      return
    }
    if (max > 0 && membres.length > max) {
      toast.error(`${membres.length} membres présents, limite ${max} impossible`)
      return
    }
    onUpdate({
      nom: form.nom.trim() || group.nom,
      montantCotisation: Number(form.montantCotisation) || 0,
      periodeJours: Number(form.periodeJours) || 7,
      deviseSymbole: form.deviseSymbole || 'FCFA',
      devisePosition: form.devisePosition,
      leReceveurCotonise: form.leReceveurCotonise,
      penalitePctParJour: Number(form.penalitePctParJour) || 0,
      penalitePlafond: Number(form.penalitePlafond) || 0,
      dateDebut: form.dateDebut,
      membresMin: min,
      membresMax: max,
      moyensPaiement: form.moyensPaiement.length ? form.moyensPaiement : ['Espèces'],
      receptionMM: {
        operateur: (form.receptionMM && form.receptionMM.operateur) || 'Orange Money',
        numero: (form.receptionMM && form.receptionMM.numero || '').trim(),
        instructions: (form.receptionMM && form.receptionMM.instructions || '').trim(),
      },
    })
    refresh()
  }

  const genererShare = () => {
    setCodeCourt(ensureCodeUnique(group.id) || '')
    setShareCopie(false)
  }
  const copierCourt = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(codeCourt)
      ok = true
    } catch {}
    if (!ok) {
      try {
        const ta = document.createElement('textarea')
        ta.value = codeCourt
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {}
    }
    setShareCopie(ok)
    setTimeout(() => setShareCopie(false), 2000)
  }
  const partagerWhatsApp = () => {
    const msg =
      `Rejoins ma tontine « ${group.nom} » !\n\n` +
      `Ouvre Tontine Manager → « Rejoindre un groupe » et tape ce code :\n\n${codeCourt}`
    ouvrirLien('https://wa.me/?text=' + encodeURIComponent(msg))
  }

  const Grid2 = ({ children }) => <div className="grid grid-cols-2 gap-3">{children}</div>

  return (
    <div className="space-y-1">
      {readOnly && (
        <div className="mb-3 flex items-start gap-2 rounded-2xl border border-info-200 bg-info-50 p-3">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-info-500" />
          <p className="text-xs text-info-700">Lecture seule : géré par le responsable.</p>
        </div>
      )}

      {readOnly && group.synchronise && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-success-200 bg-success-50 px-3 py-2.5 text-xs font-semibold text-success-700">
          <Wifi size={15} className="shrink-0" />
          <span>Synchronisé en direct avec le responsable.</span>
        </div>
      )}

      {!readOnly && (
        <>
          <Section
            icon={Coins}
            title="Informations & cotisation"
            subtitle="Nom du groupe, montant, période, devise"
            ouvert={!!ouvert.infos}
            onToggle={() => toggleSection('infos')}
          >
            <Field label="Nom">
              <input className="input" value={form.nom} onChange={set('nom')} />
            </Field>
            <Grid2>
              <Field label={`Cotisation par tour (${form.deviseSymbole})`}>
                <input className="input" type="number" min="0" value={form.montantCotisation} onChange={set('montantCotisation')} />
              </Field>
              <Field label="Période (jours)">
                <input className="input" type="number" min="1" value={form.periodeJours} onChange={set('periodeJours')} />
              </Field>
            </Grid2>
            <Grid2>
              <Field label="Symbole devise">
                <input className="input" value={form.deviseSymbole} onChange={set('deviseSymbole')} />
              </Field>
              <Field label="Position">
                <select className="input" value={form.devisePosition} onChange={set('devisePosition')}>
                  <option value="after">Après (5 000 FCFA)</option>
                  <option value="before">Avant (FCFA 5 000)</option>
                </select>
              </Field>
            </Grid2>
            <Field label="Date du premier tour">
              <input className="input" type="date" value={form.dateDebut} onChange={set('dateDebut')} />
            </Field>
          </Section>

          <Section
            icon={Wallet}
            title="Règles de cotisation"
            subtitle="Pénalités, receveur, moyens de paiement"
            ouvert={!!ouvert.regles}
            onToggle={() => toggleSection('regles')}
          >
            <Grid2>
              <Field label="Pénalité (%/jour)" hint="0 = aucune">
                <input className="input" type="number" min="0" step="0.1" value={form.penalitePctParJour} onChange={set('penalitePctParJour')} />
              </Field>
              <Field label="Plafond (%)">
                <input className="input" type="number" min="0" value={form.penalitePlafond} onChange={set('penalitePlafond')} />
              </Field>
            </Grid2>
            <Grid2>
              <Field label="Membres minimum" hint="Recommandé pour démarrer">
                <input className="input" type="number" min="1" value={form.membresMin} onChange={set('membresMin')} />
              </Field>
              <Field label="Membres maximum" hint="0 = illimité">
                <input className="input" type="number" min="0" value={form.membresMax} onChange={set('membresMax')} />
              </Field>
            </Grid2>
            <div className="mb-4 flex items-center justify-between rounded-xl bg-gray-50 px-3.5 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Le receveur cotise aussi</p>
                <p className="text-xs text-gray-400">Ne cotise pas à son propre tour si décoché</p>
              </div>
              <input type="checkbox" checked={form.leReceveurCotonise} onChange={set('leReceveurCotonise')} />
            </div>
            <div className="mb-1">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700">Moyens de paiement</p>
              <p className="mb-2 text-xs text-gray-400">Proposés lors de l'enregistrement des cotisations.</p>
              <div className="flex flex-wrap gap-2">
                {MOYENS_DISPO.map((m) => {
                  const actif = form.moyensPaiement.includes(m)
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMoyen(m)}
                      className={`rounded-full border-2 px-3.5 py-1.5 text-xs font-bold transition ${
                        actif
                          ? 'border-brand-600 bg-brand-600 text-white shadow-[0_2px_0_#46a302]'
                          : 'border-gray-200 bg-surface text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {m}
                    </button>
                  )
                })}
              </div>
            </div>
          </Section>

          <Section
            icon={Wallet}
            title="Réception des paiements Mobile Money"
            subtitle="Numéro où les membres vous envoient les cotisations"
            ouvert={!!ouvert.reception}
            onToggle={() => toggleSection('reception')}
          >
            <p className="mb-3 text-xs text-gray-400">
              Les membres paient directement sur votre compte Mobile Money. Indiquez votre
              opérateur et votre numéro de réception ; ils verront ce numéro dans l'onglet
              Paiements pour effectuer le transfert.
            </p>
            <div className="mb-3">
              <label className="label">Opérateur de réception</label>
              <select
                className="input"
                value={(form.receptionMM && form.receptionMM.operateur) || 'Orange Money'}
                onChange={(e) => setForm((f) => ({ ...f, receptionMM: { ...(f.receptionMM || {}), operateur: e.target.value } }))}
              >
                {MOBILE_MONEY.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="label">Numéro de réception</label>
              <input
                className="input"
                inputMode="tel"
                placeholder="Ex : 77 123 45 67"
                value={(form.receptionMM && form.receptionMM.numero) || ''}
                onChange={(e) => setForm((f) => ({ ...f, receptionMM: { ...(f.receptionMM || {}), numero: e.target.value } }))}
              />
            </div>
            <div>
              <label className="label">Instructions (optionnel)</label>
              <textarea
                className="input"
                rows={2}
                placeholder="Ex : Envoyez le montant exact de la cotisation avec votre nom en libellé."
                value={(form.receptionMM && form.receptionMM.instructions) || ''}
                onChange={(e) => setForm((f) => ({ ...f, receptionMM: { ...(f.receptionMM || {}), instructions: e.target.value } }))}
              />
            </div>
          </Section>

          <Section
            icon={Share2}
            title="Partager & inviter"
            subtitle="Code d'invitation pour rejoindre la tontine"
            ouvert={!!ouvert.invitation}
            onToggle={() => toggleSection('invitation')}
          >
            {!codeCourt ? (
              <button className="btn btn-primary w-full" onClick={genererShare}>
                <Share2 size={16} /> Générer le code d'invitation
              </button>
            ) : (
              <>
                <div
                  className="mb-2 flex cursor-pointer items-center justify-between rounded-2xl border-2 border-brand-200 bg-brand-50 px-4 py-3"
                  onClick={copierCourt}
                  role="button"
                  aria-label="Copier le code d'invitation"
                >
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-brand-600">Code d'invitation</p>
                    <p className="font-mono text-2xl font-extrabold tracking-widest text-gray-800">{codeCourt}</p>
                  </div>
                  <button className="btn btn-primary !px-3 text-xs" onClick={copierCourt}>
                    {shareCopie ? <Check size={16} /> : <Copy size={16} />} {shareCopie ? 'Copié' : 'Copier'}
                  </button>
                </div>
                <p className={`mb-2 text-center text-xs font-semibold ${shareCopie ? 'text-success-600' : 'text-gray-400'}`}>
                  {shareCopie ? 'Code copié ✓ Collez-le dans le message à envoyer.' : 'Touchez le code pour le copier.'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn btn-primary !px-2 text-xs" onClick={partagerWhatsApp}>
                    <MessageCircle size={16} /> WhatsApp
                  </button>
                  <button className="btn btn-secondary !px-2 text-xs" onClick={genererShare}>
                    <RefreshCw size={16} /> Régénérer
                  </button>
                </div>
                <p className="mt-3 text-xs text-gray-400">
                  L'invité reste en lecture seule ; vos modifications lui parviennent via la synchronisation.
                </p>
              </>
            )}
          </Section>

          <Section
            icon={MessageCircle}
            title="Groupe WhatsApp"
            subtitle="Créer le groupe et inviter les membres"
            ouvert={!!ouvert.whatsapp}
            onToggle={() => toggleSection('whatsapp')}
          >
            <p className="mb-3 text-xs text-gray-400">
              WhatsApp ne permet pas à une application de créer un groupe : suivez les étapes, puis enregistrez le lien.
            </p>

            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">1. Créer le groupe dans WhatsApp</p>
            <p className="mb-2 text-xs text-gray-400">
              Copiez les numéros, puis dans WhatsApp : Nouvelle discussion → Nouveau groupe → Ajouter les membres.
            </p>
            <button className="btn btn-secondary w-full" onClick={copierNumeros} disabled={!membresAvecTel.length}>
              <Users size={16} /> Copier les {membresAvecTel.length} numéro{membresAvecTel.length > 1 ? 's' : ''} des membres
            </button>
            {numsCopie && <p className="mt-2 text-center text-xs font-semibold text-success-600">Numéros copiés ✓ Collez-les dans WhatsApp.</p>}
            {membresSansTel.length > 0 && (
              <p className="mt-2 text-xs text-warning-600">
                {membresSansTel.length} membre{membresSansTel.length > 1 ? 's' : ''} sans numéro : {membresSansTel.map((m) => m.nom).join(', ')}
              </p>
            )}

            <p className="mb-1 mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">2. Message auto d'invitation</p>
            <p className="mb-2 text-xs text-gray-400">Collez ce message dans le groupe après l'avoir créé.</p>
            <button className="btn btn-secondary w-full" onClick={copierInvitation}>
              <Copy size={16} /> Copier le message d'invitation
            </button>
            {msgCopie && <p className="mt-2 text-center text-xs font-semibold text-success-600">Message copié ✓ Collez-le dans le groupe.</p>}

            <button
              className="btn btn-secondary mt-2 w-full"
              onClick={async () => {
                if (qrEnCours) return
                setQrEnCours(true)
                await partagerQRInvitation(group.id)
                setQrEnCours(false)
              }}
            >
              <Share2 size={16} /> {qrEnCours ? 'Génération…' : 'Partager le QR d\'invitation'}
            </button>
            <p className="mt-2 text-center text-[11px] text-gray-400">
              Scannez le QR : le membre rejoint la tontine avec le message d'invitation pré-rempli.
            </p>

            <p className="mb-1 mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">3. Lien du groupe (facultatif)</p>
            <p className="mb-2 text-xs text-gray-400">
              Dans WhatsApp : Infos du groupe → Inviter via le lien → Copier le lien. Collez-le ici.
            </p>
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="https://chat.whatsapp.com/…"
                value={lienGroupe}
                onChange={(e) => setLienGroupe(e.target.value)}
              />
              <button className="btn btn-primary shrink-0 !px-3" onClick={enregistrerLien} disabled={!lienGroupe.trim()}>
                {lienEnregistre ? <Check size={16} /> : <Save size={16} />}
              </button>
            </div>
            {lienEnregistre && <p className="mt-1 text-center text-xs font-semibold text-success-600">Lien enregistré ✓</p>}

            {group.whatsappLien && (
              <>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button className="btn btn-primary !px-2 text-xs" onClick={() => ouvrirLien(group.whatsappLien)}>
                    <ExternalLink size={14} /> Ouvrir le groupe
                  </button>
                  <button className="btn btn-secondary !px-2 text-xs" onClick={copierLien}>
                    {lienCopie ? <Check size={14} /> : <Copy size={14} />} {lienCopie ? 'Copié' : 'Copier le lien'}
                  </button>
                </div>
                <button className="btn btn-secondary mt-2 w-full" onClick={envoyerInvitations} disabled={!membresAvecTel.length || envoyerInvitesEnCours}>
                  {envoyerInvitesEnCours ? <Clock size={16} /> : <Send size={16} />}
                  {envoyerInvitesEnCours
                    ? `Envoi… (${envoyerInvitesCompteur}/${membresAvecTel.length})`
                    : `Envoyer le lien aux ${membresAvecTel.length} membres (WhatsApp)`}
                </button>
                <p className="mt-2 text-center text-[11px] text-gray-400">
                  Un bot peut aussi l'envoyer automatiquement (script WhatsApp Business).
                </p>
              </>
            )}
          </Section>

          <Section
            icon={Cloud}
            title="Synchronisation en ligne"
            subtitle="Partage en direct avec les invités"
            ouvert={!!ouvert.synchro}
            onToggle={() => toggleSection('synchro')}
          >
            {!firebaseConfigure() ? (
              <>
                <p className="mb-2 text-xs text-gray-400">
                  Nécessite un projet Firebase gratuit. Configuration web dans le fichier
                </p>
                <p className="mb-2 rounded-lg bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-500">src/lib/firebaseConfig.js</p>
              </>
            ) : group.synchronise ? (
              <>
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-success-50 px-3 py-2.5 text-sm font-semibold text-success-700">
                  <Wifi size={16} /> Synchronisation active
                </div>
                <button className="btn btn-secondary w-full" onClick={() => { desactiverSynchro(group.id, utilisateur ? utilisateur.uid : null); refresh(); }}>
                  <CloudOff size={16} /> Désactiver la synchronisation
                </button>
              </>
            ) : (
              <>
                <p className="mb-3 text-xs text-gray-400">
                  Les invités voient vos mises à jour en direct (internet requis).
                </p>
                <button className="btn btn-primary w-full" onClick={() => { activerSynchro(group.id, utilisateur ? utilisateur.uid : null); refresh(); }}>
                  <Cloud size={16} /> Activer la synchronisation
                </button>
              </>
            )}
          </Section>

          <Section
            icon={Crown}
            title="Co-gérants"
            subtitle="Partager la gestion avec des membres de confiance"
            ouvert={!!ouvert.cogerants}
            onToggle={() => toggleSection('cogerants')}
          >
            {estCoGerant || group.proprietaire === (utilisateur ? utilisateur.uid : null) ? (
              <p className="mb-3 text-xs text-gray-400">
                Vous avez les droits de gestion sur ce groupe (propriétaire ou co-gérant) : vos
                modifications sont partagées avec les autres responsables.
              </p>
            ) : (
              <p className="mb-3 text-xs text-gray-400">
                Les co-gérants peuvent modifier la tontine et traiter les inscriptions.
              </p>
            )}
            <div className="mb-3 space-y-2">
              <div className="flex items-center gap-2.5 rounded-xl bg-brand-50 px-3 py-2.5">
                <ShieldCheck size={16} className="shrink-0 text-brand-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800">
                    {group.proprietaire ? 'Propriétaire du groupe' : 'Vous (créateur)'}
                  </p>
                  <p className="truncate text-xs text-gray-400">
                    {group.proprietaire ? group.proprietaire : 'Gestion complète de la tontine'}
                  </p>
                </div>
              </div>
              {Object.keys(coGerants).length === 0 && (
                <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-400">
                  Aucun co-gérant pour le moment.
                </p>
              )}
              {Object.entries(coGerants).map(([uid, info]) => (
                <div key={uid} className="flex items-center gap-2.5 rounded-xl bg-warning-50 px-3 py-2.5">
                  <Crown size={16} className="shrink-0 text-warning-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-800">
                      {info.nom || 'Co-gérant'} {uid === (utilisateur ? utilisateur.uid : null) && '· vous'}
                    </p>
                    {info.email && <p className="truncate text-xs text-gray-400">{info.email}</p>}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              Pour nommer un co-gérant : onglet Membres → modifier un membre → rôle
              « Co-responsable ». Le co-gérant doit être connecté à son compte Google.
            </p>
          </Section>

          <Section
            icon={CalendarCheck}
            title="Bilan annuel & clôture"
            subtitle="Exercices clôturés et archives"
            ouvert={!!ouvert.bilanAnnuel}
            onToggle={() => toggleSection('bilanAnnuel')}
          >
            <div className="mb-3 flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500">Exercice</label>
              <select className="input max-w-[7rem]" value={anneeBilan} onChange={(e) => setAnneeBilan(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-success-50 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-success-600">Cotisé</p>
                <p className="text-base font-extrabold text-gray-800">{formatMontant(bilanAnnee.totalCotis, group)}</p>
              </div>
              <div className="rounded-xl bg-warning-50 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-warning-600">Pénalités</p>
                <p className="text-base font-extrabold text-gray-800">{formatMontant(bilanAnnee.totalPenalites, group)}</p>
              </div>
              <div className="rounded-xl bg-info-50 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-info-600">Distribué</p>
                <p className="text-base font-extrabold text-gray-800">{formatMontant(bilanAnnee.totalRecu, group)}</p>
              </div>
              <div className="rounded-xl bg-brand-50 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-brand-600">Solde</p>
                <p className="text-base font-extrabold text-gray-800">{formatMontant(bilanAnnee.solde, group)}</p>
              </div>
            </div>
            <p className="mb-3 text-xs text-gray-400">
              {bilanAnnee.nbTours} tour{bilanAnnee.nbTours > 1 ? 's' : ''} · {bilanAnnee.nbPaiements} paiement{bilanAnnee.nbPaiements > 1 ? 's' : ''} sur l'exercice {bilanAnnee.annee}.
            </p>
            <button className="btn btn-primary w-full" onClick={cloreAnnee} disabled={archivageEnCours}>
              <Archive size={16} /> {archivageEnCours ? 'Clôture…' : `Clôturer l'exercice ${anneeBilan}`}
            </button>
            {archives.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Exercices archivés</p>
                {archives.map((a) => (
                  <div key={a.annee} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                    <span className="text-sm font-bold text-gray-700">{a.annee}</span>
                    <span className="text-xs text-gray-500">
                      Cotisé {formatMontant(a.totalCotis, group)} · Distribué {formatMontant(a.totalRecu, group)} · Solde {formatMontant(a.solde, group)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            icon={Download}
            title="Export"
            subtitle="Bilan PDF et fichiers Excel"
            ouvert={!!ouvert.export}
            onToggle={() => toggleSection('export')}
          >
            <div className="grid grid-cols-2 gap-3">
              <button className="btn btn-primary" onClick={() => exporterBilanPDF(group.id)}>
                <FileText size={16} /> Bilan PDF
              </button>
              <button className="btn btn-secondary" onClick={() => exporterGroupeExcel(group.id)}>
                <Users size={16} /> Excel complet
              </button>
              <button className="btn btn-secondary" onClick={() => exporterMembresCSV(group.id)}>
                <Users size={16} /> Membres (CSV)
              </button>
              <button className="btn btn-secondary" onClick={() => exporterToursCSV(group.id)}>
                <CalendarDays size={16} /> Tours (CSV)
              </button>
              <button className="btn btn-secondary" onClick={() => exporterHistoriqueCSV(group.id)}>
                <History size={16} /> Historique (CSV)
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              « Excel complet » : fichier .xlsx multi-feuilles (synthèse, membres, tours,
              paiements, historique, prêts). CSV ouvrables dans Excel / Google Sheets.
              Devise : {form.deviseSymbole}.
            </p>
          </Section>

          <div className="-mx-4 mt-4 border-t border-gray-100 bg-surface px-4 py-3">
            <button className="btn btn-primary w-full" onClick={save}>
              <Save size={16} /> Enregistrer les modifications
            </button>
          </div>
        </>
      )}
    </div>
  )
}
