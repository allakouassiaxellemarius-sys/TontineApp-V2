import { useState } from 'react'
import { Plus, Phone, Ban, CheckCircle2, Pencil, Trash2, Users, ShieldCheck, AlertTriangle, Hourglass, UserRound, Crown, Wallet, Gift, UserPlus, MoreHorizontal } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { haptic } from '../../lib/haptique'
import { getMembres, getTours, getBilan, addMembre, updateMembre, deleteMembre, toggleBloque, getParticipationMembre, doublonMembre, getTourProchain, getPaiementMembre, ajouterAuJournal } from '../../lib/db'
import { enregistrerPaiement, messageEchec } from '../../lib/paiements'
import { todayStr } from '../../lib/storage'
import { formatMontant, formatDate, getSettings } from '../../lib/format'
import { envoyerBienvenue, ouvrirLien, envoyerRappel, telephoneValide, lienAppel } from '../../lib/remind'
import Modal from '../../components/Modal'
import Field from '../../components/Field'
import EmptyState from '../../components/EmptyState'
import Avatar from '../../components/Avatar'
import ImportContactsModal from '../../components/ImportContactsModal'
import Menu from '../../components/ui/Menu'
import { choisirPhoto } from '../../lib/photo'

const ROLE_LABELS = {
  membre: 'Membre',
  tresorier: 'Trésorier',
  'co-responsable': 'Co-responsable',
}
const ROLE_ICONES = { tresorier: ShieldCheck, 'co-responsable': Crown }

export default function MembersTab({ group, readOnly }) {
  const { refresh } = useData()
  const { utilisateur } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [form, setForm] = useState({ nom: '', telephone: '', role: 'membre' })
  const [profil, setProfil] = useState(null)
  const [notice, setNotice] = useState(null)
  const [importOpen, setImportOpen] = useState(false)

  const membres = getMembres(group.id)
  const tours = getTours(group.id)
  const bilan = getBilan(group.id)
  const max = Number(group.membresMax || 0)
  const complet = max > 0 && membres.length >= max
  const tourProchain = getTourProchain(group.id)

  const marquerPaye = (m) => {
    if (!tourProchain) return
    const montant = Number(group.montantCotisation) || 0
    const res = enregistrerPaiement(group, tourProchain, m, montant, todayStr(), 'cash', {})
    refresh()
    haptic.tap()
    if (res && res.ok === false) toast.warning(res.message || 'Paiement non enregistré')
    else toast.success(`${m.nom} a payé ${formatMontant(montant, group)}`)
  }

  const relancer = (m) => {
    if (!tourProchain) return
    const r = envoyerRappel(m, group, tourProchain)
    if (!r || !r.ok) { toast.error('Impossible de relancer ce membre'); return }
    if (r.via === 'whatsapp') ouvrirLien(r.url)
    toast.info(r.via === 'sms' ? `Rappel envoyé à ${m.nom} par SMS` : `Rappel prêt pour ${m.nom}`)
  }

  // Appel natif (tel:) + trace dans le journal d'audit.
  const appelerMembre = (m) => {
    const lien = lienAppel(m.telephone)
    if (!lien) { toast.warning(`${m.nom} n'a pas de numéro valide`); return }
    ouvrirLien(lien)
    const qui = (utilisateur && (utilisateur.displayName || utilisateur.email)) || 'Le responsable'
    ajouterAuJournal(group.id, 'appel', `${qui} a appelé ${m.nom}`)
    refresh()
    haptic.tap()
  }

  const openAdd = () => {
    setEdit(null)
    setForm({ nom: '', telephone: '', role: 'membre' })
    setOpen(true)
  }
  const openEdit = (m) => {
    setEdit(m)
    setForm({ nom: m.nom, telephone: m.telephone, role: m.role || 'membre' })
    setOpen(true)
  }

  const envoyerBienvenueAuto = (membre) => {
    const settings = getSettings()
    if (!settings.bienvenueActif || !membre.telephone) return
    const r = envoyerBienvenue(membre, group)
    if (!r.ok) return
    if (r.via === 'whatsapp') ouvrirLien(r.url)
    setNotice(
      r.via === 'sms'
        ? `Message de bienvenue envoyé à ${membre.nom} par SMS ✓`
        : `Message de bienvenue prêt sur WhatsApp pour ${membre.nom}`
    )
    setTimeout(() => setNotice(null), 6000)
  }

  const setPhotoMembre = async (m) => {
    const data = await choisirPhoto()
    if (data) {
      updateMembre(m.id, { photo: data })
      refresh()
      haptic.tap()
    }
  }

  const submit = () => {
    if (!form.nom.trim()) return
    if (edit) {
      updateMembre(edit.id, { nom: form.nom.trim(), telephone: form.telephone.trim(), role: form.role })
      haptic.tap()
      toast.success(`Membre modifié`)
    } else {
      const existant = doublonMembre(group.id, { nom: form.nom, telephone: form.telephone, email: form.email })
      if (existant) {
        toast.error(`« ${existant.nom} » fait déjà partie de la tontine`)
        haptic.warning()
        return
      }
      const m = addMembre(group.id, { nom: form.nom.trim(), telephone: form.telephone.trim(), role: form.role })
      if (!m) {
        toast.error(max > 0 ? 'Nombre maximum de membres atteint' : 'Ajout impossible')
        return
      }
      envoyerBienvenueAuto(m)
      haptic.success()
      toast.success(`${m.nom} a été ajouté`)
    }
    refresh()
    setOpen(false)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          <span className="text-xl font-extrabold text-brand-600">{membres.length}</span>{' '}
          <span className="font-bold text-gray-700">membre{membres.length > 1 ? 's' : ''}</span>
          {max > 0 && <span className="text-gray-400"> / {max}</span>}
        </p>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost !py-2" onClick={() => setImportOpen(true)}>
              <UserPlus size={16} /> Importer
            </button>
            <button className="btn btn-primary !py-2" onClick={openAdd} disabled={complet}>
              <Plus size={16} /> {complet ? 'Complet' : 'Ajouter'}
            </button>
          </div>
        )}
      </div>

      {complet && !readOnly && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-warning-200 bg-warning-50 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning-500" />
          <p className="text-xs text-warning-700">
            Nombre maximum de membres atteint ({max}). Augmentez la limite dans les réglages du groupe pour ajouter d'autres membres.
          </p>
        </div>
      )}

      {readOnly && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-info-200 bg-info-50 p-3">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-info-500" />
          <p className="text-xs text-info-700">Lecture seule : la liste est gérée par le responsable.</p>
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-success-200 bg-success-50 p-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success-500" />
          <p className="text-xs text-success-700">{notice}</p>
        </div>
      )}

      {membres.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun membre"
          description="Ajoutez les membres de la tontine avec leur nom et numéro de téléphone."
          action={!readOnly && <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Ajouter un membre</button>}
        />
      ) : (
        <div className="space-y-2">
          {membres.map((m) => {
            const info = bilan.parMembre.find((p) => p.membre.id === m.id)
            const estMoi = utilisateur && m.uid && m.uid === utilisateur.uid
            const aUnTour = tours.some((t) => t.membreId === m.id)
            const enRetard = (info?.nbEnRetard || 0) > 0
            let statut = null
            if (!m.bloque && tours.length > 0) {
              if (enRetard) {
                statut = (
                  <span className="badge shrink-0 bg-danger-100 text-danger-700">
                    <AlertTriangle size={10} /> {info.nbEnRetard} tour{info.nbEnRetard > 1 ? 's' : ''} en retard
                    {info.penalitesEnCours > 0 && ` (+${formatMontant(info.penalitesEnCours, group)})`}
                  </span>
                )
              } else if (info?.cotise > 0 || aUnTour) {
                statut = <span className="badge shrink-0 bg-success-100 text-success-700"><CheckCircle2 size={10} /> À jour</span>
              } else {
                statut = <span className="badge shrink-0 bg-gray-100 text-gray-500"><Hourglass size={10} /> Aucun tour</span>
              }
            }
            return (
              <div key={m.id} className={`card flex items-center gap-3 p-3.5 ${m.bloque ? 'opacity-70' : ''}`}>
                <Avatar
                  src={m.photo}
                  nom={m.nom}
                  size={44}
                  className={!readOnly ? 'cursor-pointer' : ''}
                  onClick={!readOnly ? () => setPhotoMembre(m) : undefined}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-gray-800">{m.nom}</p>
                    {estMoi && <span className="badge shrink-0 bg-brand-600 text-white"><CheckCircle2 size={10} /> Vous</span>}
                    {m.role === 'tresorier' && <span className="badge shrink-0 bg-info-100 text-info-700"><ShieldCheck size={10} /> Trésorier</span>}
                    {m.role === 'co-responsable' && <span className="badge shrink-0 bg-warning-100 text-warning-700"><Crown size={10} /> Co-responsable</span>}
                    {m.bloque && <span className="badge shrink-0 bg-danger-100 text-danger-600"><Ban size={10} /> Bloqué</span>}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                    {m.telephone && telephoneValide(m.telephone) ? (
                      <button type="button" onClick={() => appelerMembre(m)} className="flex items-center gap-1 text-brand-600 hover:underline" aria-label={`Appeler ${m.nom}`}>
                        <Phone size={11} /> {m.telephone}
                      </button>
                    ) : (
                      <span className="flex items-center gap-1"><Phone size={11} /> {m.telephone || 'Pas de numéro'}</span>
                    )}
                    {statut}
                  </p>
                  {!readOnly && (
                    <p className="mt-0.5 text-xs">
                      <span className="font-semibold text-success-600">Cotisé {formatMontant(info?.cotise || 0, group)}</span>
                      <span className="text-gray-400"> · </span>
                      <span className={info?.solde >= 0 ? 'text-brand-600' : 'text-danger-600'}>
                        {info?.solde >= 0 ? 'Net reçu ' : 'À recevoir '}
                        {formatMontant(Math.abs(info?.solde || 0), group)}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center">
                  {!readOnly && (() => {
                    const tel = (m.telephone || '').replace(/\D/g, '')
                    const aPaye = tourProchain ? !!getPaiementMembre(tourProchain.id, m.id) : true
                    return (
                      <Menu
                        icon={MoreHorizontal}
                        ariaLabel={`Actions pour ${m.nom}`}
                        items={[
                          ...(tourProchain && !aPaye ? [
                            { label: 'Marquer payé', icon: CheckCircle2, onClick: () => marquerPaye(m) },
                            { label: 'Relancer', icon: AlertTriangle, onClick: () => relancer(m) },
                          ] : []),
                          ...(telephoneValide(m.telephone) ? [
                            { label: 'Appeler', icon: Phone, onClick: () => appelerMembre(m) },
                          ] : []),
                          ...(tel ? [
                            { label: 'Contacter', icon: Phone, onClick: () => ouvrirLien(`https://wa.me/${tel}`) },
                          ] : []),
                          { label: 'Profil & historique', icon: UserRound, onClick: () => setProfil(getParticipationMembre(group.id, m.id)) },
                          { label: 'Modifier', icon: Pencil, onClick: () => openEdit(m) },
                          m.bloque
                            ? { label: 'Débloquer', icon: CheckCircle2, onClick: () => { toggleBloque(m.id); refresh(); haptic.tap(); toast.success(`${m.nom} a été débloqué`) } }
                            : { label: 'Bloquer', icon: ShieldCheck, onClick: () => { toggleBloque(m.id); refresh(); haptic.tap(); toast.info(`${m.nom} a été bloqué`) } },
                          { sep: true },
                          { label: 'Retirer', icon: Trash2, danger: true, onClick: () => setConfirmDel(m) },
                        ]}
                      />
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={edit ? 'Modifier le membre' : 'Ajouter un membre'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={submit} disabled={!form.nom.trim()}>
              {edit ? 'Enregistrer' : 'Ajouter'}
            </button>
          </>
        }
      >
        <Field label="Nom complet">
          <input className="input" type="text" autoCapitalize="words" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder="Ex. Aya Kouassi" value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} />
        </Field>
        <Field label="Numéro de téléphone" hint="Utilisé pour les rappels WhatsApp / SMS">
          <input className="input" type="tel" inputMode="tel" autoComplete="tel" autoCapitalize="off" placeholder="Ex. 07 07 00 00 00" value={form.telephone} onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))} />
        </Field>
        <Field label="Rôle" hint="Trésorier ou co-responsable pour partager la gestion">
          <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            {Object.entries(ROLE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </Field>
      </Modal>

      <Modal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Supprimer le membre ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmDel(null)}>Annuler</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                const res = deleteMembre(confirmDel.id)
                if (!res.ok) {
                  toast.error(messageEchec(res.raison))
                  setConfirmDel(null)
                  refresh()
                  return
                }
                setConfirmDel(null)
                refresh()
                haptic.warning()
                toast.info(
                  res.toursAnnules > 0
                    ? `${confirmDel.nom} a été supprimé — ${res.toursAnnules} tour(s) annulé(s)`
                    : `${confirmDel.nom} a été supprimé`
                )
              }}
            >
              <Trash2 size={16} /> Supprimer
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          « {confirmDel?.nom} » et ses cotisations seront supprimés. Ses tours non
          distribués seront <strong>annulés</strong> (ils restent au planning et au
          bilan) ; les paiements des autres membres sont conservés.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Impossible si cette personne a déjà reçu son pot : l'argent est sorti,
          le supprimer fausserait le bilan du groupe.
        </p>
      </Modal>

      <Modal
        open={!!profil}
        onClose={() => setProfil(null)}
        title="Profil & participation"
        footer={
          <button className="btn btn-primary w-full" onClick={() => setProfil(null)}>Fermer</button>
        }
      >
        {profil && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar src={profil.membre.photo} nom={profil.membre.nom} size={48} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-800">{profil.membre.nom}</p>
                <p className="text-xs text-gray-400">
                  {profil.membre.role && profil.membre.role !== 'membre' ? ROLE_LABELS[profil.membre.role] : 'Membre'}
                  {profil.membre.bloque ? ' · Bloqué' : ''}
                </p>
                {!readOnly && (
                  <button
                    className="mt-1 text-[11px] font-semibold text-brand-600 hover:underline"
                    onClick={() => setPhotoMembre(profil.membre)}
                  >
                    Changer la photo
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-brand-50 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-brand-600"><Wallet size={11} /> Cotisations</p>
                <p className="mt-1 text-sm font-extrabold text-gray-800">{formatMontant(profil.montantCotise, group)}</p>
                <p className="text-[11px] text-gray-400">{profil.nbCotisations} payée{profil.nbCotisations > 1 ? 's' : ''}</p>
              </div>
              <div className="rounded-2xl bg-success-50 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-success-600"><Gift size={11} /> Pots reçus</p>
                <p className="mt-1 text-sm font-extrabold text-gray-800">{formatMontant(profil.montantRecu, group)}</p>
                <p className="text-[11px] text-gray-400">{profil.potsRecus.length} reçu{profil.potsRecus.length > 1 ? 's' : ''}</p>
              </div>
              <div className="rounded-2xl bg-warning-50 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-warning-600"><AlertTriangle size={11} /> En retard</p>
                <p className="mt-1 text-sm font-extrabold text-gray-800">{profil.nbEnRetard} tour{profil.nbEnRetard > 1 ? 's' : ''}</p>
                <p className="text-[11px] text-gray-400">Pénalités {formatMontant(profil.penalitesEnCours, group)}</p>
              </div>
              <div className="rounded-2xl bg-info-50 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-info-600"><CheckCircle2 size={11} /> Participation</p>
                <p className="mt-1 text-sm font-extrabold text-gray-800">{profil.tauxParticipation}%</p>
                <p className="text-[11px] text-gray-400">sur les tours écoulés</p>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Historique des cotisations</p>
              {profil.cotisations.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-400">Aucune cotisation enregistrée.</p>
              ) : (
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {profil.cotisations.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                      <p className="text-xs text-gray-600">
                        Tour #{c.tour?.numero || '?'} · {formatDate(c.datePaiement)}
                        {c.moyenPaiement && <span className="text-gray-400"> · {c.moyenPaiement}</span>}
                      </p>
                      <p className="text-xs font-bold text-gray-700">
                        {formatMontant(Number(c.montant || 0), group)}
                        {c.penalite > 0 && <span className="text-danger-500"> +{formatMontant(c.penalite, group)}</span>}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {importOpen && (
        <ImportContactsModal
          group={group}
          onClose={() => setImportOpen(false)}
          onDone={() => refresh()}
        />
      )}
    </div>
  )
}
