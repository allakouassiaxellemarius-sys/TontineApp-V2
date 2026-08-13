import { useEffect, useState } from 'react'
import { ShieldCheck, HandCoins, History, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import flutterwave from '../../lib/flutterwave'
import { getMembres, getToursAvecMembre } from '../../lib/db'
import { formatMontant, formatDate } from '../../lib/format'
import { firebaseConfigure } from '../../lib/firebaseConfig'

export default function Tresorerie({ group, uid, estGerant }) {
  const toast = useToast()
  const code = group.codeUnique
  const membres = getMembres(group.id)
  const tours = getToursAvecMembre(group.id).filter((t) => t.statut === 'en_attente' || t.statut === 'recu')

  const [reconciliation, setReconciliation] = useState(null)
  const [transferts, setTransferts] = useState(null)
  const [audit, setAudit] = useState(null)
  const [compte, setCompte] = useState(null)

  const [assign, setAssign] = useState({}) // { [id]: { membreId, tourId } }
  const [form, setForm] = useState({ montant: '', currency: group.deviseSymbole || 'NGN', bankCode: '', accountNumber: '', fullname: '', narration: '' })
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    if (!code) return
    const u1 = flutterwave.abonnerReconciliation(code, setReconciliation)
    const u2 = flutterwave.abonnerTransferts(code, setTransferts)
    const u3 = flutterwave.abonnerAudit(code, setAudit)
    const u4 = flutterwave.abonnerCompte(code, setCompte)
    return () => { u1(); u2(); u3(); u4() }
  }, [code])

  // Devise du retrait = devise du compte Flutterwave (NGN), sauf si modifiée.
  useEffect(() => {
    if (compte && compte.devise && !form.currency) setForm((f) => ({ ...f, currency: compte.devise }))
  }, [compte])

  const nonReconnus = reconciliation ? Object.entries(reconciliation).filter(([, v]) => v && v.statutReconciliation === 'en_attente') : []

  const assigner = async (id) => {
    const a = assign[id]
    if (!a || !a.membreId || !a.tourId) { toast.error('Choisissez un membre et un tour'); return }
    try {
      await flutterwave.reconcilierManuel(code, id, a.membreId, a.tourId)
      toast.success('Paiement assigné — intégration en cours')
    } catch (e) {
      toast.error((e && e.message) || 'Échec')
    }
  }

  const demanderRetrait = async () => {
    const montant = Number(form.montant)
    if (!montant || !form.bankCode || !form.accountNumber || !form.fullname) {
      toast.error('Montants et coordonnées bancaires requis'); return
    }
    setEnCours(true)
    try {
      const r = await flutterwave.demanderRetrait(code, { ...form, currency: form.currency || compte?.devise || group.deviseSymbole || 'NGN' })
      if (r.statut === 'en_attente_double') {
        toast.success('Retrait soumis — nécessite la validation d’un second gestionnaire')
      } else {
        toast.success('Retrait exécuté (' + (r.statut || 'ok') + ')')
      }
      setForm({ ...form, montant: '', bankCode: '', accountNumber: '', fullname: '', narration: '' })
    } catch (e) {
      toast.error((e && e.message) || 'Échec du retrait')
    } finally {
      setEnCours(false)
    }
  }

  const approuver = async (transferId) => {
    try {
      await flutterwave.approuverRetrait(code, transferId)
      toast.success('Retrait validé et exécuté')
    } catch (e) {
      toast.error((e && e.message) || 'Échec de la validation')
    }
  }

  const listeTransferts = transferts ? Object.entries(transferts) : []
  const listeAudit = audit
    ? Object.entries(audit).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.quand || 0) - (a.quand || 0)).slice(0, 50)
    : []

  if (!estGerant) return null
  if (!firebaseConfigure()) {
    return <div className="card p-4 text-sm text-gray-500">Synchronisation cloud requise pour la trésorerie.</div>
  }

  return (
    <div className="space-y-4">
      {/* 1. Paiements non reconnus */}
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600" />
          <p className="text-sm font-bold text-gray-800">Paiements à réconcilier</p>
        </div>
        {nonReconnus.length === 0 ? (
          <p className="text-xs text-gray-400">Aucun paiement en attente de validation.</p>
        ) : (
          <div className="space-y-3">
            {nonReconnus.map(([id, p]) => (
              <div key={id} className="rounded-xl bg-amber-50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-amber-900">{formatMontant(p.montant || 0, group)} {p.devise || ''}</span>
                  <span className="text-[11px] text-amber-700">{formatDate(new Date(p.recuLe || Date.now()).toISOString().slice(0, 10))}</span>
                </div>
                {p.narration && <p className="mt-1 text-[11px] text-amber-700">Libellé : {p.narration}</p>}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <select className="input !py-1.5 text-xs" value={assign[id]?.membreId || ''} onChange={(e) => setAssign((s) => ({ ...s, [id]: { ...s[id], membreId: Number(e.target.value) } }))}>
                    <option value="">Membre…</option>
                    {membres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                  </select>
                  <select className="input !py-1.5 text-xs" value={assign[id]?.tourId || ''} onChange={(e) => setAssign((s) => ({ ...s, [id]: { ...s[id], tourId: Number(e.target.value) } }))}>
                    <option value="">Tour…</option>
                    {tours.map((t) => <option key={t.id} value={t.id}>Tour #{t.numero}</option>)}
                  </select>
                </div>
                <button className="btn btn-primary mt-2 w-full !py-1.5 text-xs" onClick={() => assigner(id)}>
                  <CheckCircle2 size={14} /> Assigner et intégrer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Retraits */}
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2">
          <HandCoins size={16} className="text-brand-600" />
          <p className="text-sm font-bold text-gray-800">Retrait / distribution des fonds</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className="input !py-1.5 text-sm" type="number" placeholder="Montant" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} />
          <input className="input !py-1.5 text-sm" placeholder="Devise (NGN)" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          <input className="input !py-1.5 text-sm" placeholder="Code banque (ex: 044)" value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })} />
          <input className="input !py-1.5 text-sm" placeholder="Numéro de compte" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
          <input className="input !py-1.5 text-sm col-span-2" placeholder="Nom du bénéficiaire" value={form.fullname} onChange={(e) => setForm({ ...form, fullname: e.target.value })} />
          <input className="input !py-1.5 text-sm col-span-2" placeholder="Libellé (optionnel)" value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} />
        </div>
        <button className="btn btn-primary mt-2 w-full" disabled={enCours} onClick={demanderRetrait}>
          {enCours ? 'Traitement…' : 'Demander le retrait'}
        </button>

        {listeTransferts.length > 0 && (
          <div className="mt-3 space-y-2">
            {listeTransferts.map(([id, t]) => (
              <div key={id} className="rounded-xl bg-gray-50 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-800">{formatMontant(t.montant || 0, group)} {t.devise || ''}</span>
                  <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">{t.statut}</span>
                </div>
                <p className="text-gray-500">{t.destinataire?.fullname} — {t.destinataire?.accountNumber}</p>
                {t.statut === 'en_attente_double' && t.demandeurUid !== uid && (
                  <button className="btn btn-secondary mt-1.5 w-full !py-1 text-[11px]" onClick={() => approuver(id)}>
                    <ShieldCheck size={13} /> Valider (2e signature)
                  </button>
                )}
                {t.statut === 'en_attente_double' && t.demandeurUid === uid && (
                  <p className="mt-1 text-[11px] text-amber-600">En attente de la validation d’un second gestionnaire.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Journal d'audit (transparence) */}
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2">
          <History size={16} className="text-gray-600" />
          <p className="text-sm font-bold text-gray-800">Journal d’audit (transparence)</p>
        </div>
        {listeAudit.length === 0 ? (
          <p className="text-xs text-gray-400">Aucune opération enregistrée.</p>
        ) : (
          <div className="space-y-1.5">
            {listeAudit.map((a) => (
              <div key={a.id} className="flex items-start justify-between border-b border-gray-100 py-1.5 text-[11px]">
                <div>
                  <p className="font-semibold text-gray-700">{a.action}</p>
                  <p className="text-gray-400">{a.statut}{a.montant ? ' · ' + a.montant + ' ' + (a.devise || '') : ''}</p>
                </div>
                <span className="text-gray-400">{a.quand ? formatDate(new Date(a.quand).toISOString().slice(0, 10)) : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
