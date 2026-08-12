import { useMemo, useState } from 'react'
import { AlertTriangle, BadgeDollarSign, ChevronDown, CircleDollarSign, HandCoins, Plus, Trash2, Undo2, Wallet } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { haptic } from '../../lib/haptique'
import {
  getPrets,
  getMembres,
  createPret,
  updatePret,
  rembourserPret,
  retirerRemboursement,
  supprimerPret,
  totalARembourser,
  rembourseTotal,
  resteAPayer,
  etatPret,
} from '../../lib/db'
import { formatMontant, formatDate } from '../../lib/format'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'

function dansJours(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function FormModal({ form, membres, deviseSymbole, onFormChange, onClose, onValider }) {
  return (
    <Modal
      open={!!form}
      onClose={onClose}
      title={form?.mode === 'nouveau' ? 'Nouveau prêt' : 'Modifier le prêt'}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={onValider}>
            <CircleDollarSign size={16} /> {form?.mode === 'nouveau' ? 'Enregistrer' : 'Enregistrer'}
          </button>
        </>
      }
    >
      {form && (
        <div className="space-y-3">
          <div>
            <label className="label">Emprunteur</label>
            <select
              className="input"
              value={form.emprunteurId}
              onChange={(e) => onFormChange({ ...form, emprunteurId: e.target.value })}
            >
              {membres.map((m) => (
                <option key={m.id} value={m.id}>{m.nom}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Montant ({deviseSymbole})</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={form.montant}
              onChange={(e) => onFormChange({ ...form, montant: e.target.value })}
              placeholder="0"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Taux d'intérêt (%)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={form.tauxInteret}
                onChange={(e) => onFormChange({ ...form, tauxInteret: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="label">Échéance</label>
              <input
                className="input"
                type="date"
                value={form.dateEcheance}
                onChange={(e) => onFormChange({ ...form, dateEcheance: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Note (optionnel)</label>
            <input
              className="input"
              type="text"
              value={form.note}
              onChange={(e) => onFormChange({ ...form, note: e.target.value })}
              placeholder="Ex : prêt remboursable sur 3 mois"
            />
          </div>
        </div>
      )}
    </Modal>
  )
}

const ETATS = {
  en_cours: { libelle: 'En cours', classes: 'bg-brand-50 text-brand-700' },
  en_retard: { libelle: 'En retard', classes: 'bg-danger-50 text-danger-600' },
  rembourse: { libelle: 'Remboursé', classes: 'bg-success-50 text-success-600' },
}

export default function PretsTab({ group, readOnly }) {
  const { refresh } = useData()
  const toast = useToast()
  const membres = getMembres(group.id)
  const prets = getPrets(group.id)
  const auj = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState(null)
  const [rembourserModal, setRembourserModal] = useState(null)
  const [rembourserMontant, setRembourserMontant] = useState('')
  const [rembourserDate, setRembourserDate] = useState(auj)
  const [supprimerConfirm, setSupprimerConfirm] = useState(null)
  const [ouvert, setOuvert] = useState({})

  const lignes = useMemo(() => prets.map((p) => {
    const etat = etatPret(p, auj)
    return {
      pret: p,
      emprunteur: membres.find((m) => m.id === p.emprunteurId) || null,
      total: totalARembourser(p),
      rembourse: rembourseTotal(p),
      reste: resteAPayer(p),
      etat,
    }
  }), [prets, membres, auj])

  const stats = useMemo(() => {
    const enCours = lignes.filter((l) => l.etat !== 'rembourse')
    return {
      enCours: enCours.length,
      restant: enCours.reduce((s, l) => s + l.reste, 0),
      rembourseTotal: lignes.reduce((s, l) => s + l.rembourse, 0),
    }
  }, [lignes])

  const ouvrirNouveau = () => {
    setForm({
      mode: 'nouveau',
      emprunteurId: membres[0]?.id != null ? String(membres[0].id) : '',
      montant: String(group.montantCotisation || ''),
      tauxInteret: '0',
      dateEcheance: dansJours(30),
      note: '',
    })
  }

  const ouvrirModifier = (l) => {
    setForm({
      mode: 'modifier',
      id: l.pret.id,
      emprunteurId: l.pret.emprunteurId != null ? String(l.pret.emprunteurId) : '',
      montant: String(l.pret.montant),
      tauxInteret: String(l.pret.tauxInteret || 0),
      dateEcheance: l.pret.dateEcheance || dansJours(30),
      note: l.pret.note || '',
    })
  }

  const validerForm = () => {
    if (!form || readOnly) return
    const montant = Number(form.montant) || 0
    if (montant <= 0) {
      toast.error('Montant invalide')
      return
    }
    const data = {
      emprunteurId: form.emprunteurId ? Number(form.emprunteurId) : null,
      montant,
      tauxInteret: Number(form.tauxInteret) || 0,
      dateEcheance: form.dateEcheance || dansJours(30),
      note: form.note,
    }
    if (form.mode === 'nouveau') {
      createPret(group.id, data)
      toast.success('Prêt enregistré')
    } else {
      updatePret(form.id, data)
      toast.success('Prêt modifié')
    }
    setForm(null)
    refresh()
    haptic.success()
  }

  const ouvrirRembourser = (l) => {
    setRembourserMontant(String(l.reste))
    setRembourserDate(auj)
    setRembourserModal(l)
  }

  const validerRemboursement = () => {
    const montant = Number(rembourserMontant) || 0
    if (montant <= 0) {
      toast.error('Montant invalide')
      return
    }
    rembourserPret(rembourserModal.pret.id, montant, rembourserDate)
    setRembourserModal(null)
    refresh()
    haptic.success()
    toast.success('Remboursement enregistré')
  }

  const retirer = (l, remboursement) => {
    retirerRemboursement(l.pret.id, remboursement.id)
    refresh()
    haptic.tap()
    toast.info('Remboursement retiré')
  }

  const confirmerSuppression = () => {
    supprimerPret(supprimerConfirm.pret.id)
    setSupprimerConfirm(null)
    refresh()
    haptic.tap()
    toast.info('Prêt supprimé')
  }

  if (membres.length === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        title="Aucun membre"
        description="Ajoutez d'abord des membres au groupe pour pouvoir enregistrer des prêts entre eux."
      />
    )
  }

  if (prets.length === 0) {
    return (
      <div>
        <EmptyState
          icon={HandCoins}
          title="Aucun prêt"
          description="Enregistrez les prêts accordés entre membres et suivez les remboursements."
          action={
            !readOnly && (
              <button className="btn btn-primary w-full" onClick={ouvrirNouveau}>
                <Plus size={16} /> Nouveau prêt
              </button>
            )
          }
        />
        <FormModal
          form={form}
          membres={membres}
          deviseSymbole={group.deviseSymbole}
          onFormChange={setForm}
          onClose={() => setForm(null)}
          onValider={validerForm}
        />
      </div>
    )
  }

  return (
    <div>
      {readOnly && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-info-200 bg-info-50 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-info-500" />
          <p className="text-xs text-info-700">Lecture seule : les prêts sont gérés par le responsable.</p>
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-brand-50 p-3">
          <p className="text-[11px] font-semibold text-brand-500">En cours</p>
          <p className="text-sm font-extrabold text-brand-800">{stats.enCours}</p>
        </div>
        <div className="rounded-2xl bg-warning-50 p-3">
          <p className="text-[11px] font-semibold text-warning-500">Reste à percevoir</p>
          <p className="text-sm font-extrabold text-warning-700">{formatMontant(stats.restant, group)}</p>
        </div>
        <div className="rounded-2xl bg-success-50 p-3">
          <p className="text-[11px] font-semibold text-success-500">Remboursé</p>
          <p className="text-sm font-extrabold text-success-700">{formatMontant(stats.rembourseTotal, group)}</p>
        </div>
      </div>

      {!readOnly && (
        <button className="btn btn-primary mb-4 w-full" onClick={ouvrirNouveau}>
          <Plus size={16} /> Nouveau prêt
        </button>
      )}

      <div className="space-y-3">
        {lignes.map((l) => {
          const badge = ETATS[l.etat] || ETATS.en_cours
          const pct = l.total > 0 ? Math.min((l.rembourse / l.total) * 100, 100) : 0
          const estOuvert = !!ouvert[l.pret.id]
          return (
            <div key={l.pret.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-extrabold text-brand-700">
                    {(l.emprunteur?.nom || '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-800">{l.emprunteur?.nom || 'Membre supprimé'}</p>
                    <p className="text-xs text-gray-400">
                      Échéance le {formatDate(l.pret.dateEcheance)}
                      {l.pret.tauxInteret > 0 && ` · ${l.pret.tauxInteret}% d'intérêt`}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-extrabold text-gray-800">{formatMontant(l.reste, group)}</p>
                  <p className="text-xs text-gray-400">restant</p>
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-bold ${badge.classes}`}>{badge.libelle}</span>
                  <span className="font-semibold text-gray-500">
                    {formatMontant(l.rembourse, group)} / {formatMontant(l.total, group)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${l.etat === 'rembourse' ? 'bg-success-500' : l.etat === 'en_retard' ? 'bg-danger-500' : 'bg-brand-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {l.pret.note && <p className="mt-2 text-xs italic text-gray-500">« {l.pret.note} »</p>}

              {!readOnly && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {l.etat !== 'rembourse' && (
                    <button className="btn btn-primary btn-sm" onClick={() => ouvrirRembourser(l)}>
                      <Wallet size={14} /> Rembourser
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => ouvrirModifier(l)}>
                    <CircleDollarSign size={14} /> Modifier
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSupprimerConfirm(l)}>
                    <Trash2 size={14} /> Supprimer
                  </button>
                  {l.pret.remboursements.length > 0 && (
                    <button
                      className="btn btn-ghost btn-sm ml-auto"
                      onClick={() => setOuvert({ ...ouvert, [l.pret.id]: !estOuvert })}
                    >
                      <ChevronDown size={14} className={`transition ${estOuvert ? 'rotate-180' : ''}`} />
                      {estOuvert ? 'Masquer' : `${l.pret.remboursements.length} versement(s)`}
                    </button>
                  )}
                </div>
              )}

              {estOuvert && (
                <ul className="mt-3 space-y-1.5 rounded-xl bg-gray-50 p-3">
                  {l.pret.remboursements.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        {formatDate(r.date)} · <span className="font-bold text-gray-800">{formatMontant(r.montant, group)}</span>
                      </span>
                      {!readOnly && (
                        <button className="rounded-lg p-1 text-gray-400 hover:bg-gray-200 hover:text-danger-500" onClick={() => retirer(l, r)} aria-label="Retirer ce versement">
                          <Undo2 size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      <FormModal
        form={form}
        membres={membres}
        deviseSymbole={group.deviseSymbole}
        onFormChange={setForm}
        onClose={() => setForm(null)}
        onValider={validerForm}
      />

      <Modal
        open={!!rembourserModal}
        onClose={() => setRembourserModal(null)}
        title="Encaisser un remboursement"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRembourserModal(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={validerRemboursement}>
              <BadgeDollarSign size={16} /> Valider
            </button>
          </>
        }
      >
        {rembourserModal && (
          <div className="space-y-3">
            <div className="rounded-xl bg-brand-50 p-3 text-center">
              <p className="text-sm font-bold text-brand-800">{rembourserModal.emprunteur?.nom}</p>
              <p className="mt-1 text-lg font-extrabold text-brand-700">Reste à payer : {formatMontant(rembourserModal.reste, group)}</p>
            </div>
            <div>
              <label className="label">Montant reçu ({group.deviseSymbole})</label>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                value={rembourserMontant}
                onChange={(e) => setRembourserMontant(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={rembourserDate} onChange={(e) => setRembourserDate(e.target.value)} />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!supprimerConfirm}
        onClose={() => setSupprimerConfirm(null)}
        title="Supprimer ce prêt ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setSupprimerConfirm(null)}>Annuler</button>
            <button className="btn btn-danger" onClick={confirmerSuppression}>
              <Trash2 size={16} /> Supprimer
            </button>
          </>
        }
      >
        {supprimerConfirm && (
          <p className="text-sm text-gray-600">
            Le prêt de {formatMontant(supprimerConfirm.pret.montant, group)} accordé à{' '}
            <span className="font-semibold">{supprimerConfirm.emprunteur?.nom || 'un membre'}</span> et son historique de
            remboursements seront définitivement retirés.
          </p>
        )}
      </Modal>
    </div>
  )
}
