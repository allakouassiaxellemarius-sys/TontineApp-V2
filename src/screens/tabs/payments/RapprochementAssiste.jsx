import { useMemo, useState } from 'react'
import { ScanLine, CheckCircle2, AlertTriangle, Eraser, HelpCircle } from 'lucide-react'
import { useData } from '../../../context/DataContext'
import { useToast } from '../../../context/ToastContext'
import { haptic } from '../../../lib/haptique'
import { getMembres } from '../../../lib/db'
import { getPaiementsTour, enregistrerPaiement, STATUT } from '../../../lib/paiements'
import {
  analyserReleve,
  rapprocher,
  marquerDoublons,
  estApplicable,
  attenteMembre,
  paiementDe,
  resumeRapprochement,
  LIBELLES_CONFIANCE,
} from '../../../lib/rapprochement'
import { formatMontant, formatDate } from '../../../lib/format'
import Avatar from '../../../components/Avatar'

const TON_CONF = {
  ref: 'bg-success-100 text-success-700',
  tel: 'bg-info-100 text-info-700',
  nom: 'bg-info-100 text-info-700',
  montant: 'bg-warning-100 text-warning-700',
  manuel: 'bg-gray-100 text-gray-600',
}

const EXEMPLE =
  'Orange Money Vous avez recu 5 000 FCFA de 0707001122 le 26/09/2026\n' +
  'Wave: Aya Kouassi a envoye 5.000 FCFA a ta tontine'

export default function RapprochementAssiste({ group, tour, onFermer }) {
  const { refresh } = useData()
  const toast = useToast()

  const [texte, setTexte] = useState('')
  const [lignes, setLignes] = useState(null)
  const [retenues, setRetenues] = useState({})
  const [enCours, setEnCours] = useState(false)

  const membres = getMembres(group.id)
  const attendus = useMemo(() => getPaiementsTour(group, tour), [group, tour])

  // Ce que chaque membre doit encore : sert aux libellés du sélecteur manuel.
  const restePour = (m) => {
    const l = attendus.find((x) => Number(x.membre.id) === Number(m.id))
    if (!l || l.statut === STATUT.PAYE) return 0
    return Number(group.montantCotisation) || 0
  }

  const analyser = () => {
    const brutes = analyserReleve(texte)
    if (!brutes.length) {
      toast.error('Aucune ligne lisible. Colle un SMS ou un historique, une ligne par virement.')
      return
    }
    const calculees = rapprocher({ lignes: brutes, groupe: group, tour, membres })
    setLignes(calculees)
    const parCle = {}
    calculees.forEach((s) => { parCle[s.cle] = estApplicable(s) })
    setRetenues(parCle)
  }

  const assigner = (cle, membreId) => {
    const choisi = membreId ? membres.find((m) => String(m.id) === String(membreId)) : null
    const maj = lignes.map((s) => {
      if (s.cle !== cle) return s
      if (!choisi) return { ...s, membre: null, confiance: '', reste: 0, dejaEncaisse: false, motif: 'Aucun membre choisi' }
      const att = attenteMembre(group, tour, choisi)
      const motif = att.dejaEncaisse
        ? 'Déjà enregistré pour ce tour'
        : s.montant && att.reste && s.montant !== att.reste
        ? `Montant différent : ${s.montant} reçus pour ${att.reste} attendus`
        : ''
      return { ...s, membre: choisi, confiance: 'manuel', reste: att.reste, dejaEncaisse: att.dejaEncaisse, motif }
    })
    // L'association manuelle peut créer un doublon avec une autre ligne :
    // le contrôle est le même qu'à l'analyse.
    const avecDoublons = marquerDoublons(maj)
    const sortie = avecDoublons.find((s) => s.cle === cle)
    setLignes(avecDoublons)
    setRetenues((r) => ({ ...r, [cle]: !!sortie && estApplicable(sortie) }))
  }

  const appliquer = () => {
    const reten = (lignes || []).filter((s) => s.membre && !s.dejaEncaisse && retenues[s.cle])
    if (!reten.length) {
      toast.warning('Coche au moins une ligne à enregistrer.')
      return
    }
    setEnCours(true)
    const avant = getPaiementsTour(group, tour).filter((l) => l.statut === STATUT.PAYE).length
    for (const s of reten) {
      const p = paiementDe(s, group)
      enregistrerPaiement(group, tour, s.membre, p.montant, p.datePaiement, p.moyen, p.details)
    }
    refresh()
    const apres = getPaiementsTour(group, tour).filter((l) => l.statut === STATUT.PAYE).length
    setEnCours(false)

    // enregistrerPaiement échoue en silence (groupe rejoint, hors ligne) : on
    // mesure ce qui a réellement été écrit au lieu d'annoncer le nombre saisi.
    const ecrits = Math.max(0, apres - avant)
    if (ecrits === 0) {
      toast.error('Enregistrement impossible (groupe en lecture seule ou hors ligne).')
      return
    }
    haptic.success()
    const rests = reten.length - ecrits
    toast.success(
      `${ecrits} paiement${ecrits > 1 ? 's' : ''} rapproché${ecrits > 1 ? 's' : ''}${rests > 0 ? `, ${rests} déjà compté${rests > 1 ? 's' : ''}` : ''}`,
    )
    onFermer()
  }

  const r = lignes ? resumeRapprochement(lignes) : null
  const aEnregistrer = (lignes || []).filter((s) => s.membre && !s.dejaEncaisse && retenues[s.cle]).length

  // ── Étape 1 : coller le relevé ──────────────────────────────
  if (!lignes) {
    return (
      <div className="card mb-4 p-4">
        <div className="mb-3 flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
            <ScanLine size={18} />
          </span>
          <div>
            <p className="text-sm font-bold text-gray-800">Rapprochement assisté</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Colle tes SMS Wave / Orange Money ou l'historique copié de l'app opérateur.
              L'app reconnaît le membre grâce à sa référence, son numéro ou son nom, puis
              pré-remplit les paiements du tour #{tour.numero}.
            </p>
          </div>
        </div>

        <textarea
          className="input h-36 w-full resize-none font-mono text-xs"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={EXEMPLE}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
        />

        <div className="mt-3 flex gap-2">
          <button className="btn btn-secondary flex-1" onClick={() => { setTexte(''); setLignes(null) }} disabled={!texte.trim()}>
            <Eraser size={16} /> Effacer
          </button>
          <button className="btn btn-primary flex-1" onClick={analyser} disabled={!texte.trim()}>
            <ScanLine size={16} /> Analyser
          </button>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-gray-400">
          <HelpCircle size={13} className="mt-0.5 shrink-0" />
          Rien ne quitte ton téléphone : l'analyse est locale.
        </p>
      </div>
    )
  }

  // ── Étape 2 : valider les correspondances ───────────────────
  return (
    <div className="card mb-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-gray-800">
          {r.total} ligne{r.total > 1 ? 's' : ''} · {r.applicables} reconnue{r.applicables > 1 ? 's' : ''}
        </p>
        <button className="btn btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setLignes(null)}>
          Modifier le relevé
        </button>
      </div>

      {r.aTrancher > 0 && (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-warning-50 px-3 py-2 text-[11px] font-semibold text-warning-700">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {r.aTrancher} ligne{r.aTrancher > 1 ? 's' : ''} sans membre identifié : choisis-le moi-même ou laisse-la de côté.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {lignes.map((s) => {
          const activable = !!s.membre && !s.dejaEncaisse
          return (
            <div
              key={s.cle}
              className={`rounded-2xl border p-3 transition ${
                s.dejaEncaisse
                  ? 'border-gray-200 bg-gray-50 opacity-70'
                  : retenues[s.cle]
                  ? 'border-success-200 bg-success-50'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-2 disabled:opacity-30"
                  checked={activable && !!retenues[s.cle]}
                  disabled={!activable}
                  onChange={() => setRetenues((prev) => ({ ...prev, [s.cle]: !prev[s.cle] }))}
                />
                {s.membre ? (
                  <Avatar nom={s.membre.nom} size={36} />
                ) : (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-400">
                    <HelpCircle size={16} />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-gray-800">
                      {s.membre ? s.membre.nom : 'Membre à identifier'}
                    </p>
                    <p className="shrink-0 text-sm font-bold text-gray-900">
                      {formatMontant(s.montant || s.reste || group.montantCotisation, group)}
                    </p>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-gray-400">{s.brut}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {s.confiance && (
                      <span className={`badge ${TON_CONF[s.confiance] || TON_CONF.manuel}`}>
                        {LIBELLES_CONFIANCE[s.confiance]}
                      </span>
                    )}
                    {s.date && <span className="badge bg-gray-100 text-gray-500">{formatDate(s.date)}</span>}
                    {s.operateur && s.operateur !== 'Mobile Money' && (
                      <span className="badge bg-gray-100 text-gray-500">{s.operateur}</span>
                    )}
                    {s.dejaEncaisse && <span className="badge bg-info-100 text-info-700">Déjà payé ce tour</span>}
                  </div>

                  {!s.membre && (
                    <select
                      className="input mt-2 w-full !py-2 text-xs"
                      value=""
                      onChange={(e) => assigner(s.cle, e.target.value)}
                    >
                      <option value="">— Choisir un membre —</option>
                      {membres.map((m) => {
                        const du = restePour(m)
                        return (
                          <option key={m.id} value={m.id}>
                            {m.nom}
                            {du > 0 ? ` · doit ${formatMontant(du, group)}` : ' · à jour'}
                          </option>
                        )
                      })}
                    </select>
                  )}

                  {s.motif && !s.dejaEncaisse && (
                    <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-warning-700">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      {s.motif}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          className="btn btn-secondary flex-1"
          onClick={() => {
            const parCle = {}
            lignes.forEach((s) => { parCle[s.cle] = estApplicable(s) })
            setRetenues(parCle)
          }}
        >
          Cocher les reconnues
        </button>
        <button className="btn btn-primary flex-1" onClick={appliquer} disabled={aEnregistrer === 0 || enCours}>
          <CheckCircle2 size={16} />
          {enCours ? 'Enregistrement…' : `Enregistrer ${aEnregistrer} paiement${aEnregistrer > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
