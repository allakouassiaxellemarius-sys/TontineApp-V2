import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, PiggyBank, Plus, Target, Gift, AlertTriangle, Wallet, Trash2,
  ArrowDownCircle, ArrowUpCircle, X, CalendarDays, Lock, Bell, Check, Car, Heart, Plane,
  Home, Briefcase, BookOpen, Sparkles, ShieldCheck,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useConnection } from '../context/ConnectionContext'
import { useToast } from '../context/ToastContext'
import { haptic } from '../lib/haptique'
import {
  getEpargnes, creerEpargne, verserEpargne, retirerEpargne, retirerVersement,
  supprimerEpargne, totalEpargne, updateEpargne,
} from '../lib/db'
import { messageEchec } from '../lib/paiements'
import { formatMontant, formatDate } from '../lib/format'
import { todayStr, dateISO } from '../lib/storage'
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

const aujourdhui = () => todayStr()
const dansMois = (n) => {
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return dateISO(d)
}

export default function EpargneScreen() {
  const navigate = useNavigate()
  const { refresh, settings } = useData()
  const { modeHorsLigne } = useConnection()
  const toast = useToast()
  useLangue()

  const [createOpen, setCreateOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [detail, setDetail] = useState(null)
  const [verserCible, setVerserCible] = useState(null)
  const [retraitCible, setRetraitCible] = useState(null)
  const [form, setForm] = useState({ nom: '', objectif: '', icone: 'piggy', echeance: '' })
  const [versement, setVersement] = useState({ montant: '500' })
  const [retrait, setRetrait] = useState({ montant: '' })

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
    const res = verserEpargne(cible.id, montant, aujourdhui())
    if (!res.ok) { toast.error(messageEchec(res.raison)); return }
    refresh()
    haptic.success()
    toast.success(`${formatMontant(montant, cible)} versé sur ${cible.nom}`)
  }

  const creer = () => {
    if (!form.nom.trim()) return
    const res = creerEpargne({
      nom: form.nom, objectif: form.objectif, icone: form.icone, echeance: form.echeance,
      deviseSymbole: settings.deviseSymbole, devisePosition: settings.devisePosition,
    })
    if (!res.ok) { toast.error(messageEchec(res.raison)); return }
    refresh()
    setCreateOpen(false)
    setForm({ nom: '', objectif: '', icone: 'piggy', echeance: '' })
    haptic.success()
    toast.success(t('epargne.creee', { nom: res.epargne.nom }))
  }

  const demarrerModele = (m) => {
    const res = creerEpargne({
      nom: m.nom, objectif: m.objectif, icone: m.icone, echeance: dansMois(m.mois),
      deviseSymbole: settings.deviseSymbole, devisePosition: settings.devisePosition, modele: m.key,
    })
    if (!res.ok) { toast.error(messageEchec(res.raison)); return }
    // premier versement immédiat : 0 -> 500 FCFA, annoncé seulement s'il est écrit
    const v = verserEpargne(res.epargne.id, 500, aujourdhui())
    refresh()
    haptic.success()
    toast.success(
      v.ok
        ? `Objectif « ${m.nom} » créé · 500 ${devise} versé`
        : `Objectif « ${m.nom} » créé · premier versement non enregistré`
    )
  }

  const ouvrirVerser = (e) => { setVersement({ montant: '500' }); setVerserCible(e) }
  const confirmerVersement = () => {
    const m = Number(versement.montant)
    if (!m || m <= 0 || !verserCible) return
    const res = verserEpargne(verserCible.id, m, aujourdhui())
    if (!res.ok) { toast.error(messageEchec(res.raison)); return }
    refresh()
    setVersement({ montant: '500' })
    setVerserCible(null)
    haptic.success()
    toast.success(`${formatMontant(m, verserCible)} versé sur ${verserCible.nom}`)
  }

  const ouvrirRetirer = (e) => { setRetrait({ montant: '' }); setRetraitCible(e) }
  const confirmerRetrait = () => {
    const m = Number(retrait.montant)
    if (!m || m <= 0 || !retraitCible) return
    const res = retirerEpargne(retraitCible.id, m, aujourdhui())
    if (!res.ok) { toast.error(messageEchec(res.raison)); return }
    refresh()
    setRetrait({ montant: '' })
    setRetraitCible(null)
    haptic.success()
    toast.success(`${formatMontant(m, retraitCible)} retiré de ${retraitCible.nom}`)
  }

  // Supprimer une écriture de l'historique n'est pas un simple nettoyage : le
  // solde baisse d'autant, donc mêmes gardes que le retrait (verrou, solde).
  const annulerEcriture = (e, v) => {
    const res = retirerVersement(e.id, v.id)
    if (!res.ok) { toast.error(messageEchec(res.raison)); return }
    rechargerDetail(e.id)
    refresh()
    haptic.tap()
  }

  const rechargerDetail = (id) => setDetail(getEpargnes().find((e) => e.id === id) || null)

  const basculerRappel = async () => {
    if (!detail) return
    const cible = detail
    const next = !cible.rappel
    // Le rappel n'existe que s'il est écrit : annoncer « Rappel activé » sur un
    // stockage qui a refusé (hors ligne) ferait mentir l'interrupteur.
    if (!updateEpargne(cible.id, { rappel: next })) {
      toast.error(messageEchec(modeHorsLigne ? 'hors_ligne' : 'ecriture'))
      return
    }
    if (next) {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications')
        const p = await LocalNotifications.checkPermissions()
        let perm = p.display
        if (perm === 'prompt') perm = (await LocalNotifications.requestPermissions()).display
        if (perm !== 'granted') {
          // Aucune notification ne partira : on remet l'interrupteur à OFF au
          // lieu de laisser croire que le rappel quotidien est en route.
          updateEpargne(cible.id, { rappel: false })
          toast.info('Permission de notification refusée')
        } else {
          await LocalNotifications.schedule({
            notifications: [{
              id: 3000000 + cible.id, title: `Épargne · ${cible.nom}`,
              body: `Versez 500 ${devise} aujourd'hui 💪`, sound: 'chime_duo.wav',
              schedule: { every: 'day', hour: 20, minute: 0 },
            }],
          })
          toast.success('Rappel quotidien activé')
        }
      } catch {
        updateEpargne(cible.id, { rappel: false })
        toast.error('Rappel indisponible')
      }
    } else {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications')
        await LocalNotifications.cancel({ notifications: [{ id: 3000000 + cible.id }] })
      } catch {}
      toast.info('Rappel désactivé')
    }
    rechargerDetail(cible.id)
  }

  const basculerVerrou = () => {
    if (!detail) return
    const maj = updateEpargne(detail.id, { verrouille: !detail.verrouille })
    if (!maj) { toast.error(messageEchec(modeHorsLigne ? 'hors_ligne' : 'ecriture')); return }
    setDetail(maj)
    refresh()
    haptic.tap()
    toast.info(maj.verrouille ? 'Verrouillé : retraits et suppressions bloqués' : 'Verrouillage désactivé')
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
            <div className="h-2.5 overflow-hidden rounded-full bg-track">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${pctGlobal}%` }} />
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

      {/* CONFIANCE (LOI 5) : aucune donnée d'épargne ne quitte l'appareil, mais
          le stockage local est en clair -> on ne promet pas de chiffrement. */}
      <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-gray-50 py-2 text-[11px] font-semibold text-gray-500">
        <ShieldCheck size={13} className="text-success-500" />
        Local. Privé. Sauvegardable depuis Réglages.
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
                  {e.objectif > 0 && pct >= 100 ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-success-200 bg-success-50 px-2 py-1 text-[11px] font-bold text-success-700">
                      <Check size={12} /> Atteint
                    </span>
                  ) : (
                    <span className="text-sm font-extrabold text-brand-600">{pct}%</span>
                  )}
                </div>
                {e.objectif > 0 && (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-track">
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
          <input className="input" type="text" autoCapitalize="words" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder="Ex. Vacances, Voiture…" value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} />
        </Field>
        <Field label={`Objectif (${devise})`} hint="Laissez vide pour une épargne libre">
          <input className="input" type="number" inputMode="decimal" step="1" autoComplete="off" min="0" placeholder="100000" value={form.objectif} onChange={(e) => setForm((f) => ({ ...f, objectif: e.target.value }))} />
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
            <div className="flex w-full gap-2">
              <button className="btn btn-primary flex-1" onClick={() => { ouvrirVerser(detail); setDetail(null) }}>
                <ArrowDownCircle size={16} /> Verser
              </button>
              <button className="btn btn-secondary flex-1" onClick={() => { ouvrirRetirer(detail); setDetail(null) }}>
                <ArrowUpCircle size={16} /> Retirer
              </button>
            </div>
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
                <div className="h-2.5 overflow-hidden rounded-full bg-track">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress(detail)}%` }} />
                </div>
                <p className={`mt-1 text-right text-xs font-semibold ${progress(detail) >= 100 ? 'text-success-700' : 'text-gray-400'}`}>
                  {progress(detail) >= 100 ? 'Objectif atteint' : `${progress(detail)}% atteint`}
                </p>
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
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Historique</p>
                <button className="text-[11px] font-semibold text-danger-500" onClick={() => setConfirmDel(detail)}>Supprimer</button>
              </div>
              {(detail.versements || []).length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-400">Aucune écriture pour l'instant.</p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {(detail.versements || []).slice().reverse().map((v) => {
                    const estRetrait = Number(v.montant) < 0
                    return (
                      <div key={v.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-600">
                          {formatDate(v.date)}
                          <span className="ml-1.5 text-[10px] font-semibold uppercase text-gray-400">{estRetrait ? 'retrait' : 'versement'}</span>
                        </p>
                        <div className="flex items-center gap-2">
                          <p className={`text-xs font-bold ${estRetrait ? 'text-warning-600' : 'text-gray-700'}`}>
                            {estRetrait ? '−' : '+'}{formatMontant(Math.abs(Number(v.montant) || 0), detail)}
                          </p>
                          <button className="rounded p-0.5 text-gray-400 hover:text-danger-500" onClick={() => annulerEcriture(detail, v)} aria-label="Supprimer cette écriture">
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
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
          <input className="input" type="number" inputMode="decimal" step="1" autoComplete="off" min="1" value={versement.montant} onChange={(e) => setVersement((v) => ({ ...v, montant: e.target.value }))} />
        </Field>
      </Modal>

      {/* RETRAIT */}
      <Modal
        open={!!retraitCible}
        onClose={() => setRetraitCible(null)}
        title={`Retirer · ${retraitCible?.nom || ''}`}
        footer={
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => setRetraitCible(null)}>{t('commun.annuler')}</button>
            <button className="btn btn-primary" onClick={confirmerRetrait} disabled={!Number(retrait.montant) || Number(retrait.montant) <= 0}>
              <ArrowUpCircle size={16} /> Retirer
            </button>
          </div>
        }
      >
        <p className="mb-2 text-xs text-gray-400">
          Solde disponible : <b className="text-gray-700">{formatMontant(totalEpargne(retraitCible), retraitCible)}</b>
          {retraitCible?.verrouille && ' · cagnotte verrouillée'}
        </p>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {[500, 1000].map((m) => (
            <button
              key={m}
              onClick={() => setRetrait({ montant: String(m) })}
              className={`rounded-xl border py-3 text-sm font-bold ${Number(retrait.montant) === m ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-gray-200 text-gray-600'}`}
            >
              {m.toLocaleString('fr-FR')}
            </button>
          ))}
          <button
            onClick={() => setRetrait({ montant: String(Math.max(0, totalEpargne(retraitCible))) })}
            className="rounded-xl border border-gray-200 py-3 text-sm font-bold text-gray-600"
          >
            Tout
          </button>
        </div>
        <Field label={`Montant (${retraitCible?.deviseSymbole || devise})`}>
          <input className="input" type="number" inputMode="decimal" step="1" autoComplete="off" min="1" value={retrait.montant} onChange={(e) => setRetrait((r) => ({ ...r, montant: e.target.value }))} />
        </Field>
        <p className="mt-2 text-[11px] text-gray-400">
          Le retrait s’inscrit dans l’historique : ça n’efface pas le versement d’origine, contrairement à la croix ✕ sur une écriture.
        </p>
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
                const res = supprimerEpargne(confirmDel.id)
                if (!res.ok) { toast.error(messageEchec(res.raison)); return }
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
        <p className="text-sm text-gray-600">
          « {confirmDel?.nom} » et {confirmDel?.versements?.length || 0} écriture(s) seront supprimés.
          {confirmDel && totalEpargne(confirmDel) > 0 && (
            <> Le solde de <b>{formatMontant(totalEpargne(confirmDel), confirmDel)}</b> disparaîtra avec l’objectif.</>
          )}
        </p>
      </Modal>
    </div>
  )
}
