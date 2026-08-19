import { useEffect, useState } from 'react'
import { HandCoins, History, Wallet } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { abonnerTransferts, abonnerAudit, retraitManuel } from '../../lib/cotisation'
import { getMembres, getToursAvecMembre, updateGroup } from '../../lib/db'
import { formatMontant, formatDate } from '../../lib/format'
import { syncDisponible } from '../../lib/cloudApi'

export default function Tresorerie({ group, uid, estGerant }) {
  const toast = useToast()
  const code = group.codeUnique
  const membres = getMembres(group.id)
  const tours = getToursAvecMembre(group.id).filter((t) => t.statut === 'en_attente' || t.statut === 'recu')
  // Tour à régler = le même que dans l'onglet Paiements (premier tour actif).
  const aDistribuer = tours[0] || null

  const [transferts, setTransferts] = useState(null)
  const [audit, setAudit] = useState(null)
  const [banque, setBanque] = useState(group.banque || { nom: '', compte: '', titulaire: '' })
  const [payout, setPayout] = useState({ montant: '', membreId: '', note: '' })
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    if (!code) return
    const u2 = abonnerTransferts(code, setTransferts)
    const u3 = abonnerAudit(code, setAudit)
    return () => { u2(); u3() }
  }, [code])

  // Pré-remplissage automatique de la distribution à partir du « Tour à régler »
  // (bénéficiaire + montant du pot), pour ne laisser qu'un bouton « Confirmer ».
  useEffect(() => {
    if (!aDistribuer) return
    setPayout((p) => ({
      ...p,
      membreId: aDistribuer.membreId != null ? String(aDistribuer.membreId) : p.membreId,
      montant: p.montant || (aDistribuer.montantPot ? String(aDistribuer.montantPot) : p.montant),
    }))
  }, [aDistribuer])

  const enregistrerPayout = async () => {
    const montant = Number(payout.montant)
    const membre = membres.find((m) => m.id === Number(payout.membreId))
    if (!montant || !payout.membreId) { toast.error('Montant et bénéficiaire requis'); return }
    setEnCours(true)
    try {
      await retraitManuel(code, { montant, membreId: payout.membreId, nom: membre ? membre.nom : '', note: payout.note })
      toast.success('Paiement manuel enregistré (transparence)')
      setPayout({ montant: '', membreId: '', note: '' })
    } catch (e) {
      toast.error((e && e.message) || 'Échec de l’enregistrement')
    } finally {
      setEnCours(false)
    }
  }

  const sauverBanque = async () => {
    try {
      await updateGroup(group.id, {
        banque: { nom: banque.nom.trim(), compte: banque.compte.trim(), titulaire: banque.titulaire.trim() },
      })
      toast.success('Coordonnées bancaires enregistrées')
    } catch (e) {
      toast.error((e && e.message) || 'Échec de l’enregistrement')
    }
  }

  const listeTransferts = transferts ? Object.entries(transferts) : []
  const listeAudit = audit
    ? Object.entries(audit).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.quand || 0) - (a.quand || 0)).slice(0, 50)
    : []

  if (!estGerant) return null
  if (!syncDisponible()) {
    return <div className="card p-4 text-sm text-gray-500">Synchronisation cloud requise pour la trésorerie.</div>
  }

  return (
    <div className="space-y-4">
      {/* 0. Coordonnées bancaires (virement manuel, zéro KYC) */}
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Wallet size={16} className="text-emerald-600" />
          <p className="text-sm font-bold text-gray-800">Coordonnées bancaires (virement manuel)</p>
        </div>
        <p className="mb-2 text-xs text-gray-500">
          Saisis le compte de la tontine. Les membres y vireront leur cotisation en indiquant leur référence (onglet Cotisations).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input className="input !py-1.5 text-sm col-span-2" placeholder="Banque (ex : UBA)" value={banque.nom} onChange={(e) => setBanque({ ...banque, nom: e.target.value })} />
          <input className="input !py-1.5 text-sm col-span-2" placeholder="Numéro de compte" value={banque.compte} onChange={(e) => setBanque({ ...banque, compte: e.target.value })} />
          <input className="input !py-1.5 text-sm col-span-2" placeholder="Titulaire du compte" value={banque.titulaire} onChange={(e) => setBanque({ ...banque, titulaire: e.target.value })} />
        </div>
        <button className="btn btn-primary mt-2 w-full" onClick={sauverBanque}>Enregistrer le compte</button>
      </div>

      {/* 1. Retraits / distributions enregistrés */}
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2">
          <HandCoins size={16} className="text-brand-600" />
          <p className="text-sm font-bold text-gray-800">Retraits / distributions des fonds</p>
        </div>

        {listeTransferts.length > 0 && (
          <div className="space-y-2">
            {listeTransferts.map(([id, t]) => (
              <div key={id} className="rounded-xl bg-gray-50 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-800">{formatMontant(t.montant || 0, group)} {t.devise || ''}</span>
                  {t.mode === 'manuel' ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">manuel</span>
                  ) : t.statut ? (
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">{t.statut}</span>
                  ) : null}
                </div>
                {t.mode === 'manuel' ? (
                  <p className="text-gray-500">{t.nom}{t.note ? ' · ' + t.note : ''}{t.le ? ' · ' + formatDate(new Date(t.le).toISOString().slice(0, 10)) : ''}</p>
                ) : (
                  <p className="text-gray-500">{t.destinataire?.fullname} — {t.destinataire?.accountNumber}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Distribution MANUELLE (zéro KYC) */}
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Wallet size={16} className="text-emerald-600" />
          <p className="text-sm font-bold text-gray-800">Distribuer le pot (zéro KYC)</p>
        </div>
        <p className="mb-2 text-xs text-gray-500">
          Bénéficiaire et montant sont pré-remplis depuis le « Tour à régler ». Vérifie puis confirme.
        </p>
        {aDistribuer && (
          <div className="mb-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs">
            <span className="font-semibold text-emerald-700">{aDistribuer.membre?.nom || '—'}</span>
            {' · '}
            <span className="font-semibold text-emerald-700">{formatMontant(aDistribuer.montantPot || 0, group)}</span>
            {' '}(pot du tour #{aDistribuer.numero})
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <select className="input !py-1.5 text-sm col-span-2" value={payout.membreId} onChange={(e) => setPayout({ ...payout, membreId: e.target.value })}>
            <option value="">Bénéficiaire (membre)…</option>
            {membres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
          <input className="input !py-1.5 text-sm" type="number" placeholder="Montant" value={payout.montant} onChange={(e) => setPayout({ ...payout, montant: e.target.value })} />
          <input className="input !py-1.5 text-sm" placeholder="Devise" value={group.deviseSymbole || 'NGN'} readOnly />
          <input className="input !py-1.5 text-sm col-span-2" placeholder="Note (optionnel)" value={payout.note} onChange={(e) => setPayout({ ...payout, note: e.target.value })} />
        </div>
        <button className="btn btn-primary mt-2 w-full" disabled={enCours} onClick={enregistrerPayout}>
          {enCours ? 'Enregistrement…' : 'Confirmer le paiement manuel'}
        </button>
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
