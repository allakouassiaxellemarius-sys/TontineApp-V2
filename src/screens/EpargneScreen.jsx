import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, PiggyBank, Plus, Target, Gift, AlertTriangle, Wallet, Trash2,
  ArrowDownCircle, X, CalendarDays, Lock, Bell, Check, Car, Heart, Plane,
  Home, Briefcase, BookOpen, Sparkles, ShieldCheck,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { haptic } from '../lib/haptique'
import {
  getEpargnes, creerEpargne, verserEpargne, retirerVersement, supprimerEpargne,
  totalEpargne, updateEpargne,
} from '../lib/db'
import { formatMontant, formatDate } from '../lib/format'
import { t, useLangue } from '../lib/i18n'
import Modal from '../components/Modal'
import Field from '../components/Field'

// Jeu d'icônes disponibles pour un objectif.
const ICONES = {
  piggy: PiggyBank,
  alert: AlertTriangle,
  target: Target,
  gift: Gift,
  car: Car,
  heart: Heart,
  plane: Plane,
  home: Home,
  briefcase: Briefcase,
  book: BookOpen,
}
const ICONE_LISTE = Object.keys(ICONES)

// Modèles de démarrage rapide (état vide).
const MODELES = [
  { key: 'urgence', nom: 'Urgence', icone: 'alert', objectif: 50000, mois: 3, deviseSymbole: '' },
  { key: 'projet', nom: 'Projet', icone: 'target', objectif: 200000, mois: 6 },
  { key: 'cadeau', nom: 'Cadeau', icone: 'gift', objectif: 25000, mois: 1 },
]

const aujourdhui = () => new Date().toISOString().slice(0, 10)
const dansMois = (n) => {
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

export default function EpargneScreen() {
  const navigate = useNavigate()
  const { refresh, settings } = useData()
  const toast = useToast()
  useLangue()

  const [createOpen, setCreateOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [detail, setDetail] = useState(null)
  const [verserCible, setVerserCible] = useState(null)
  const [form, setForm] = useState({ nom: '', objectif: '', icone: 'piggy', echeance: '' })
  const [versement, setVersement] = useState({ montant: '500' })

  const epargnes = getEpargnes()
  const devise = settings.deviseSymbole || 'FCFA'
  const totalSaved = epargnes.reduce((s, e) => s + totalEpargne(e), 0)
  const totalObjectif = epargnes.reduce((s, e) => s + (Number(e.objectif) || 0), 0)
  const pctGlobal = totalObjectif > 0 ? Math.min(100, Math.round((totalSaved / totalObjectif) * 100)) : 0

  const Icone = (nom, size = 20, cls = '') => {
    const C = ICONES[nom] || PiggyBank
    return <C size={size} className={cls} />
  }

  // Versement rapide depuis l'en-tête (2 clics max : ouvrir > tap).
  const verserRapide = (montant) => {
    if (epargnes.length === 0) { setCreateOpen(true); return }
    const cible = epargnes[0]
    verserEpargne(cible.id, montant, aujourdhui())
    refresh()
    haptic.success()
    toast.success(`${formatMontant(montant, cible)} versé sur ${cible.nom}`)
  }

  const creer = () => {
    if (!form.nom.trim()) return
    const e = creerEpargne({
      nom: form.nom, objectif: form.objectif, icone: form.icone, echeance: form.echeance,
      deviseSymbole: settings.deviseSymbole, devisePosition: settings.devisePosition,
    })
    if (!e) { toast.error(t('epargne.creationHorsLigne')); return }
    refresh()
    setCreateOpen(false)
    setForm({ nom: '', objectif: '', icone: 'piggy', echeance: '' })
    haptic.success()
    toast.success(t('epargne.creee', { nom: e.nom }))
  }

  const demarrerModele = (m) => {
    const e = creerEpargne({
      nom: m.nom, objectif: m.objectif, icone: m.icone, echeance: dansMois(m.mois),
      deviseSymbole: settings.deviseSymbole, devisePosition: settings.devisePosition, modele: m.key,
    })
    if (!e) { toast.error(t('epargne.creationHorsLigne')); return }
    verserEpargne(e.id, 500, aujourdhui()) // premier versement immédiat : 0 -> 500 FCFA
    refresh()
    haptic.success()
    toast.success(`Objectif « ${m.nom} » créé · 500 ${devise} versé`)
  }

  const ouvrirVerser = (e) => { setVersement({ montant: '500' }); setVerserCible(e) }
  const confirmerVersement = () => {
    const m = Number(versement.montant)
    if (!m || m <= 0 || !verserCible) return
    verserEpargne(verserCible.id, m, aujourdhui())
    refresh()
    setVersement({ montant: '500' })
    setVerserCible(null)
    haptic.success()
    toast.success(`${formatMontant(m, verserCible)} versé sur ${verserCible.nom}`)
  }

  const basculerRappel = async () => {
    if (!detail) return
    const next = !detail.rappel
    updateEpargne(detail.id, { rappel: next })
    if (next) {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications')
        const p = await LocalNotifications.checkPermissions()
        let perm = p.display
        if (perm === 'prompt') perm = (await LocalNotifications.requestPermissions()).display
        if (perm === 'granted') {
          await LocalNotifications.schedule({
            notifications: [{
              id: 3000000 + detail.id, title: `Épargne · ${detail.nom}`,
              body: `Versez 500 ${devise} aujourd'hui 💪`, sound: 'chime_duo.wav',
              schedule: { every: 'day', hour: 20, minute: 0 },
            }],
          })
          toast.success('Rappel quotidien activé')
        } else toast.info('Permission de notification refusée')
      } catch (e) { toast.error('Rappel indisponible') }
    } else {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications')
        await LocalNotifications.cancel({ notifications: [{ id: 3000000 + detail.id }] })
      } catch {}
      toast.info('Rappel désactivé')
    }
    setDetail(getEpargnes().find((e) => e.id === detail.id))
  }

  const basculerVerrou = () => {
    if (!detail) return
    updateEpargne(detail.id, { verrouille: !detail.verrouille })
    setDetail(getEpargnes().find((e) => e.id === detail.id))
    refresh()
    haptic.tap()
    toast.info(detail.verrouille ? 'Verrouillage désactivé' : 'Verrouillé : retraits bloqués')
  }

  const progress = (e) => {
    if (!e.objectif) return 0
    return Math.min(100, Math.round((totalEpargne(e) / e.objectif) * 100))
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-4 pt-safe">
      <div className="mb-4 flex items-center gap-3">
        <button className="btn btn-icon" onClick={() => navigate('/')} aria-label={t('commun.retour')}>
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-bold text-gray-800">Mes Épargnes</h1>
      </div>

      {/* HEADER : total + progression globale + versement rapide */}
      <div className="card mb-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total épargné</p>
        <p className="mt-0.5 text-[32px] font-extrabold leading-none text-gray-900">
          {formatMontant(totalSaved, { deviseSymbole: devise, devisePosition: settings.devisePosition })}
        </p>
        {totalObjectif > 0 && (
          <div className="mt-3">
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pctGlobal}%` }} />
            </div>
            <p className="mt-1 text-right text-[11px] font-semibold text-gray-400">
              {pctGlobal}% de l'objectif global ({formatMontant(totalObjectif, { deviseSymbole: devise, devisePosition: settings.devisePosition })})
            </p>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button className="btn btn-primary flex-1 !py-3 text-base" onClick={() => verserRapide(500)}>
            <ArrowDownCircle size={18} /> Verser 500 {devise}
          </button>
          <button className="btn btn-secondary !py-3" onClick={() => verserRapide(1000)}>
            1 000
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] font-medium text-gray-400">
          On commence petit. 500 {devise} aujourd'hui = 60 000 dans 4 mois
        </p>
      </div>

      {/* CONFIANCE (LOI 5) */}
      <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-gray-50 py-2 text-[11px] font-semibold text-gray-500">
        <ShieldCheck size={13} className="text-success-500" />
        Chiffré. Privé. Sauvegardé.
      </div>

      {epargnes.length === 0 ? (
        <div className="card mb-3 flex flex-col items-center px-4 py-8 text-center">
          <div className="mb-3 grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-500">
            <PiggyBank size={32} />
          </div>
          <p className="text-base font-bold text-gray-800">Commencez avec 500 {devise}</p>
          <p className="mb-4 mt-1 max-w-xs text-xs text-gray-400">
            Créez un objectif en 1 tap et faites votre tout premier versement.
          </p>
          <button className="btn btn-primary w-full !py-3 text-base" onClick={() => demarrerModele(MODELES[1])}>
            <Sparkles size={18} /> Commencer avec 500 {devise}
          </button>
          <div className="mt-4 grid w-full grid-cols-3 gap-2">
            {MODELES.map((m) => (
              <button
                key={m.key}
                className="flex flex-col items-center gap-1 rounded-2xl border border-gray-200 px-2 py-3 hover:border-brand-300"
                onClick={() => demarrerModele(m)}
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  {Icone(m.icone, 18)}
                </span>
                <span className="text-[11px] font-semibold text-gray-700">{m.nom}</span>
                <span className="text-[10px] text-gray-400">{formatMontant(m.objectif, { deviseSymbole: devise, devisePosition: settings.devisePosition })}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {epargnes.map((e) => {
            const total = totalEpargne(e)
            const pct = progress(e)
            return (
              <div key={e.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    {Icone(e.icone, 22)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-800">{e.nom}</p>
                    <p className="text-xs text-gray-400">
                      {formatMontant(total, e)} / {e.objectif ? formatMontant(e.objectif, e) : 'Libre'}
                    </p>
                    {e.echeance && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
                        <CalendarDays size={11} /> Échéance {formatDate(e.echeance)}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-extrabold text-brand-600">{pct}%</span>
                </div>
                {e.objectif > 0 && (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-primary flex-1 !py-2" onClick={() => ouvrirVerser(e)}>
                    <ArrowDownCircle size={15} /> Verser
                  </button>
                  <button className="btn btn-secondary !py-2" onClick={() => setDetail(e)}>
                    Détails
                  </button>
                </div>
              </div>
            )
          })}
          <button className="btn btn-secondary w-full" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Nouvel objectif
          </button>
        </div>
      )}

      {/* CRÉATION */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nouvel objectif"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>{t('commun.annuler')}</button>
            <button className="btn btn-primary" onClick={creer} disabled={!form.nom.trim()}>
              <Plus size={16} /> Créer
            </button>
          </>
        }
      >
        <Field label="Nom de l'objectif">
          <input className="input" placeholder="Ex. Vacances, Voiture…" value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} />
        </Field>
        <Field label={`Objectif (${devise})`} hint="Laissez vide pour une épargne libre">
          <input className="input" type="number" min="0" placeholder="100000" value={form.objectif} onChange={(e) => setForm((f) => ({ ...f, objectif: e.target.value }))} />
        </Field>
        <Field label="Date butoir">
          <input className="input" type="date" value={form.echeance} onChange={(e) => setForm((f) => ({ ...f, echeance: e.target.value }))} />
        </Field>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Icône</p>
        <div className="flex flex-wrap gap-2">
          {ICONE_LISTE.map((k) => (
            <button
              key={k}
              onClick={() => setForm((f) => ({ ...f, icone: k }))}
              className={`grid h-10 w-10 place-items-center rounded-xl border ${form.icone === k ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-gray-200 text-gray-400'}`}
            >
              {Icone(k, 18)}
            </button>
          ))}
        </div>
      </Modal>

      {/* DÉTAILS */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.nom || 'Épargne'}
        footer={
          detail && (
            <button className="btn btn-primary w-full" onClick={() => { ouvrirVerser(detail); setDetail(null) }}>
              <ArrowDownCircle size={16} /> Verser un montant
            </button>
          )
        }
      >
        {detail && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-brand-50 p-3">
                <p className="text-[11px] font-semibold text-brand-600"><Wallet size={11} className="inline" /> Épargné</p>
                <p className="mt-1 text-sm font-extrabold text-gray-800">{formatMontant(totalEpargne(detail), detail)}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-gray-500"><Target size={11} /> Objectif</p>
                <p className="mt-1 text-sm font-extrabold text-gray-800">{detail.objectif ? formatMontant(detail.objectif, detail) : 'Libre'}</p>
              </div>
            </div>
            {detail.objectif > 0 && (
              <div>
                <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress(detail)}%` }} />
                </div>
                <p className="mt-1 text-right text-xs font-semibold text-gray-400">{progress(detail)}% atteint</p>
              </div>
            )}
            {detail.echeance && (
              <p className="flex items-center gap-1 text-xs text-gray-500"><CalendarDays size={12} /> Échéance {formatDate(detail.echeance)}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={basculerRappel}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold ${detail.rappel ? 'border-brand-300 bg-brand-50 text-brand-600' : 'border-gray-200 text-gray-500'}`}
              >
                <Bell size={14} /> {detail.rappel ? 'Rappel ON' : 'Rappel'}
              </button>
              <button
                onClick={basculerVerrou}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold ${detail.verrouille ? 'border-danger-300 bg-danger-50 text-danger-600' : 'border-gray-200 text-gray-500'}`}
              >
                <Lock size={14} /> {detail.verrouille ? 'Verrouillé' : 'Verrou'}
              </button>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Versements</p>
                <button className="text-[11px] font-semibold text-danger-500" onClick={() => setConfirmDel(detail)}>Supprimer</button>
              </div>
              {detail.versements.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-400">Aucun versement pour l'instant.</p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {detail.versements.slice().reverse().map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                      <p className="text-xs text-gray-600">{formatDate(v.date)}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-gray-700">+{formatMontant(v.montant, detail)}</p>
                        {!detail.verrouille && (
                          <button className="rounded p-0.5 text-gray-400 hover:text-danger-500" onClick={() => { retirerVersement(detail.id, v.id); setDetail(getEpargnes().find((e) => e.id === detail.id)); refresh(); haptic.tap() }} aria-label="Retirer">
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* VERSEMENT RAPIDE (montants prédéfinis) */}
      <Modal
        open={!!verserCible}
        onClose={() => setVerserCible(null)}
        title={`Verser · ${verserCible?.nom || ''}`}
        footer={
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => setVerserCible(null)}>{t('commun.annuler')}</button>
            <button className="btn btn-primary" onClick={confirmerVersement} disabled={!Number(versement.montant) || Number(versement.montant) <= 0}>
              <ArrowDownCircle size={16} /> Verser
            </button>
          </div>
        }
      >
        <p className="mb-2 text-xs text-gray-400">Montant ({verserCible?.deviseSymbole || devise})</p>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {[500, 1000, 5000].map((m) => (
            <button
              key={m}
              onClick={() => setVersement({ montant: String(m) })}
              className={`rounded-xl border py-3 text-sm font-bold ${Number(versement.montant) === m ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-gray-200 text-gray-600'}`}
            >
              {m.toLocaleString('fr-FR')}
            </button>
          ))}
        </div>
        <Field label="Autre montant">
          <input className="input" type="number" min="1" value={versement.montant} onChange={(e) => setVersement((v) => ({ ...v, montant: e.target.value }))} />
        </Field>
      </Modal>

      {/* SUPPRESSION */}
      <Modal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Supprimer l'objectif ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmDel(null)}>{t('commun.annuler')}</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                supprimerEpargne(confirmDel.id)
                setConfirmDel(null)
                setDetail(null)
                refresh()
                haptic.warning()
                toast.info(t('epargne.supprimee'))
              }}
            >
              <Trash2 size={16} /> Supprimer
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">« {confirmDel?.nom} » et ses versements seront supprimés.</p>
      </Modal>
    </div>
  )
}
