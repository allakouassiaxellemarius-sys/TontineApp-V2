import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, PiggyBank, Plus, Target, Wallet, Trash2, ArrowDownCircle, X } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { haptic } from '../lib/haptique'
import {
  getEpargnes, creerEpargne, verserEpargne, retirerVersement, supprimerEpargne, totalEpargne,
} from '../lib/db'
import { formatMontant, formatDate } from '../lib/format'
import { t, useLangue } from '../lib/i18n'
import Modal from '../components/Modal'
import Field from '../components/Field'
import EmptyState from '../components/EmptyState'

export default function EpargneScreen() {
  const navigate = useNavigate()
  const { refresh, settings } = useData()
  const toast = useToast()
  useLangue()
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState({ nom: '', objectif: '' })
  const [verserOpen, setVerserOpen] = useState(false)
  const [versement, setVersement] = useState({ montant: '', date: new Date().toISOString().slice(0, 10) })

  const epargnes = getEpargnes()

  const creer = () => {
    if (!form.nom.trim()) return
    const e = creerEpargne({ nom: form.nom, objectif: form.objectif, deviseSymbole: settings.deviseSymbole, devisePosition: settings.devisePosition })
    if (!e) { toast.error(t('epargne.creationHorsLigne')); return }
    refresh()
    setCreateOpen(false)
    setForm({ nom: '', objectif: '' })
    haptic.success()
    toast.success(t('epargne.creee', { nom: e.nom }))
  }

  const verser = () => {
    const m = Number(versement.montant)
    if (!m || m <= 0) return
    verserEpargne(detail.id, m, versement.date)
    refresh()
    setDetail(getEpargnes().find((e) => e.id === detail.id))
    setVersement({ montant: '', date: new Date().toISOString().slice(0, 10) })
    haptic.success()
    toast.success(t('epargne.versementEnregistre'))
  }

  const progress = (e) => {
    if (!e.objectif) return 0
    return Math.min(100, Math.round((totalEpargne(e) / e.objectif) * 100))
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-4 pt-safe">
      <div className="mb-5 flex items-center gap-3">
        <button className="btn btn-icon" onClick={() => navigate('/')} aria-label={t('commun.retour')}>
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">{t('epargne.mesEpargnes')}</h1>
      </div>

      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-success-200 bg-success-50 p-3.5">
        <PiggyBank size={20} className="mt-0.5 shrink-0 text-success-600" />
        <p className="text-xs text-success-700">
          {t('epargne.bandeau')}
        </p>
      </div>

      {epargnes.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title={t('epargne.aucune')}
          description={t('epargne.aucuneDesc')}
          action={<button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> {t('epargne.creer')}</button>}
        />
      ) : (
        <div className="space-y-3">
          {epargnes.map((e) => {
            const total = totalEpargne(e)
            const pct = progress(e)
            return (
              <div key={e.id} className="card p-4">
                <button className="w-full text-left" onClick={() => setDetail(e)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                        <PiggyBank size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-800">{e.nom}</p>
                        <p className="text-xs text-gray-400">
                          {totalEpargne(e) > 0 ? t('epargne.nVersements', { n: e.versements.length }) : t('epargne.aucunVersementCourt')}
                          {e.objectif > 0 && <> · {t('epargne.objectifMontant', { montant: formatMontant(e.objectif, e) })}</>}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-extrabold text-brand-600">{formatMontant(total, e)}</span>
                  </div>
                  {e.objectif > 0 && (
                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-right text-[11px] font-semibold text-gray-400">{pct}%</p>
                    </div>
                  )}
                </button>
              </div>
            )
          })}
          <button className="btn btn-secondary w-full" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> {t('epargne.creer')}
          </button>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('epargne.nouvelle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>{t('commun.annuler')}</button>
            <button className="btn btn-primary" onClick={creer} disabled={!form.nom.trim()}>
              <Plus size={16} /> {t('commun.creer')}
            </button>
          </>
        }
      >
        <Field label={t('epargne.nom')}>
          <input className="input" placeholder={t('epargne.nomPlaceholder')} value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} />
        </Field>
        <Field label={`${t('epargne.objectif')} (${settings.deviseSymbole})`} hint={t('epargne.objectifHint')}>
          <input className="input" type="number" min="0" placeholder="100000" value={form.objectif} onChange={(e) => setForm((f) => ({ ...f, objectif: e.target.value }))} />
        </Field>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.nom || t('epargne.epargne')}
        footer={
          detail && (
            <button className="btn btn-primary w-full" onClick={() => { setVerserOpen(true) }}>
              <ArrowDownCircle size={16} /> {t('epargne.verserMontant')}
            </button>
          )
        }
      >
        {detail && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-brand-50 p-3">
                <p className="text-[11px] font-semibold text-brand-600"><Wallet size={11} className="inline" /> {t('epargne.epargne')}</p>
                <p className="mt-1 text-sm font-extrabold text-gray-800">{formatMontant(totalEpargne(detail), detail)}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-gray-500"><Target size={11} /> {t('epargne.objectif')}</p>
                <p className="mt-1 text-sm font-extrabold text-gray-800">{detail.objectif ? formatMontant(detail.objectif, detail) : t('epargne.libre')}</p>
              </div>
            </div>
            {detail.objectif > 0 && (
              <div>
                <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress(detail)}%` }} />
                </div>
                <p className="mt-1 text-right text-xs font-semibold text-gray-400">{t('epargne.atteint', { pct: progress(detail) })}</p>
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{t('epargne.versements')}</p>
                <button className="text-[11px] font-semibold text-danger-500" onClick={() => setConfirmDel(detail)}>{t('epargne.supprimerEpargne')}</button>
              </div>
              {detail.versements.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-400">{t('epargne.aucunVersement')}</p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {detail.versements.slice().reverse().map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                      <p className="text-xs text-gray-600">{formatDate(v.date)}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-gray-700">+{formatMontant(v.montant, detail)}</p>
                        <button className="rounded p-0.5 text-gray-400 hover:text-danger-500" onClick={() => { retirerVersement(detail.id, v.id); setDetail(getEpargnes().find((e) => e.id === detail.id)); refresh(); haptic.tap() }} aria-label="Retirer ce versement">
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={verserOpen}
        onClose={() => setVerserOpen(false)}
        title={t('epargne.verserTitre', { nom: detail?.nom || '' })}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setVerserOpen(false)}>{t('commun.annuler')}</button>
            <button className="btn btn-primary" onClick={() => { verser(); setVerserOpen(false) }} disabled={!Number(versement.montant) || Number(versement.montant) <= 0}>
              <ArrowDownCircle size={16} /> {t('epargne.verserBtn')}
            </button>
          </>
        }
      >
        <Field label={`${t('epargne.montant')} (${detail?.deviseSymbole || settings.deviseSymbole})`}>
          <input className="input" type="number" min="1" placeholder="5000" value={versement.montant} onChange={(e) => setVersement((v) => ({ ...v, montant: e.target.value }))} />
        </Field>
        <Field label={t('epargne.date')}>
          <input className="input" type="date" value={versement.date} onChange={(e) => setVersement((v) => ({ ...v, date: e.target.value }))} />
        </Field>
      </Modal>

      <Modal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title={t('epargne.supprimerTitre')}
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
              <Trash2 size={16} /> {t('commun.supprimer')}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          {t('epargne.supprimerDesc', { nom: confirmDel?.nom })}
        </p>
      </Modal>
    </div>
  )
}
