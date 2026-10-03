import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, AlertCircle, UserPlus, Mail } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useConnection } from '../context/ConnectionContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { haptic } from '../lib/haptique'
import { createGroup } from '../lib/db'
import { todayStr } from '../lib/storage'
import { rejoindreParCode, restaurerMesGroupes } from '../lib/syncEngine'
import { chargerGroupesCompte } from '../lib/sync'
import { t, useLangue } from '../lib/i18n'
import { ActionsContext } from '../context/ActionsContext'
import Modal from './Modal'
import Field from './Field'

export default function GlobalActions({ children }) {
  const { groups, refresh, settings } = useData()
  const { enLigne } = useConnection()
  const { utilisateur, connecter, erreur: authErreur } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  useLangue()

  // ── Modale « Nouvelle tontine » ─────────────────────────────
  const [createOpen, setCreateOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [form, setForm] = useState({
    nom: '',
    montantCotisation: '',
    periodeJours: '7',
    dateDebut: todayStr(),
    leReceveurCotonise: true,
    penalitePctParJour: '1',
    penalitePlafond: '10',
  })
  const [showOptions, setShowOptions] = useState(false)

  // ── Modale « Rejoindre un groupe » ──────────────────────────
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinNom, setJoinNom] = useState('')
  const [joinTel, setJoinTel] = useState('')
  const [joinErr, setJoinErr] = useState('')
  const [joinBusy, setJoinBusy] = useState(false)
  const [mesGroupes, setMesGroupes] = useState([])

  // À l'ouverture du modal, on pré-remplit le nom avec le profil Google et on
  // charge les groupes déjà liés au compte (rejoignables en un geste).
  useEffect(() => {
    if (joinOpen && utilisateur) {
      setJoinNom((n) => n || utilisateur.displayName || '')
      chargerGroupesCompte(utilisateur.uid).then(setMesGroupes).catch(() => setMesGroupes([]))
    }
  }, [joinOpen, utilisateur])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const chargerMesGroupes = async (uid) => {
    try {
      setMesGroupes(await chargerGroupesCompte(uid))
    } catch {
      setMesGroupes([])
    }
  }

  const fermerRejoindre = () => {
    setJoinOpen(false)
    setJoinErr('')
    setJoinCode('')
    setJoinNom('')
    setJoinTel('')
  }

  const connexionGoogleJoin = async () => {
    if (joinBusy) return
    setJoinBusy(true)
    setJoinErr('')
    const u = await connecter()
    if (!u) {
      setJoinErr(authErreur || t('actions.annulee'))
      setJoinBusy(false)
      return
    }
    setJoinNom(u.displayName || '')
    const nb = await restaurerMesGroupes(u.uid)
    refresh()
    await chargerMesGroupes(u.uid)
    setJoinBusy(false)
    if (nb > 0) setJoinErr('')
  }

  const rejoindreDepuisCompte = async (code) => {
    if (joinBusy) return
    setJoinBusy(true)
    setJoinErr('')
    const res = await rejoindreParCode(code, {
      nom: utilisateur ? utilisateur.displayName : '',
      uid: utilisateur ? utilisateur.uid : null,
      email: utilisateur ? utilisateur.email : '',
    })
    setJoinBusy(false)
    if (!res.ok) {
      setJoinErr(res.raison)
      return
    }
    refresh()
    fermerRejoindre()
    navigate(`/groupe/${res.groupe.id}`)
  }

  const submitJoin = async () => {
    if (joinBusy) return
    if (!enLigne) {
      setJoinErr(t('actions.connexionRequiseRejoindre'))
      return
    }
    setJoinBusy(true)
    setJoinErr('')
    // Le nom du compte sert de repli : sans nom, aucune demande d'inscription
    // n'est envoyée au responsable, qui ne verra donc jamais le membre arriver.
    const res = await rejoindreParCode(joinCode, {
      nom: joinNom || (utilisateur ? utilisateur.displayName || utilisateur.email : ''),
      telephone: joinTel,
      email: utilisateur ? utilisateur.email : '',
      uid: utilisateur ? utilisateur.uid : null,
    })
    setJoinBusy(false)
    if (!res.ok) {
      setJoinErr(res.raison)
      haptic.error()
      return
    }
    refresh()
    fermerRejoindre()
    haptic.success()
    // Le groupe est rejoint même si l'inscription auprès du responsable a
    // échoué : sans ce signal, le membre croirait à tort avoir été enregistré.
    if (res.inscrit) {
      toast.success(t('actions.rejoint', { nom: res.groupe.nom }))
    } else {
      toast.warning(`Groupe « ${res.groupe.nom} » rejoint, mais votre inscription n\u2019a pas été transmise. Prévenez le responsable.`, 5000)
    }
    navigate(`/groupe/${res.groupe.id}`)
  }

  const submit = () => {
    if (!utilisateur) {
      setLoginOpen(true)
      return
    }
    const g = createGroup({
      ...form,
      deviseSymbole: settings.deviseSymbole,
      devisePosition: settings.devisePosition,
    })
    if (!g) return
    refresh()
    setCreateOpen(false)
    haptic.success()
    toast.success(t('actions.cree', { nom: g.nom }))
    navigate(`/groupe/${g.id}`)
  }

  const ouvrirNouvelle = () => {
    if (!utilisateur) {
      setLoginOpen(true)
      return
    }
    setCreateOpen(true)
  }

  const ouvrirRejoindre = () => setJoinOpen(true)

  const actions = { ouvrirNouvelle, ouvrirRejoindre }

  return (
    <ActionsContext.Provider value={actions}>
      {children}

      <Modal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        title={t('actions.connexionRequise')}
        footer={
          <button className="btn btn-secondary" onClick={() => setLoginOpen(false)}>{t('commun.annuler')}</button>
        }
      >
        <div className="flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <LogIn size={18} className="mt-0.5 shrink-0 text-brand-600" />
          <div>
            <p className="text-sm font-bold text-brand-800">{t('actions.connGoogleTitre')}</p>
            <p className="mt-1 text-xs text-brand-700">
              {t('actions.connGoogleTexte')}
            </p>
          </div>
        </div>
        <button
          className="btn btn-primary mt-4 w-full"
          onClick={async () => {
            const u = await connecter()
            if (!u) return
            setLoginOpen(false)
            setCreateOpen(true)
          }}
        >
          <LogIn size={16} /> {t('actions.seConnecterGoogle')}
        </button>
        <button className="btn btn-secondary mt-2 w-full" onClick={() => { setLoginOpen(false); navigate('/connexion') }}>
          <Mail size={16} /> {t('actions.seConnecterEmail')}
        </button>
        {authErreur && <p className="mt-3 text-center text-xs font-semibold text-danger-600">{authErreur}</p>}
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('nav.nouvelleTontine')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>{t('commun.annuler')}</button>
            <button className="btn btn-primary" onClick={submit} disabled={!form.nom.trim() || !form.montantCotisation || !enLigne}>
              {t('commun.creer')}
            </button>
          </>
        }
      >
        <Field label={t('actions.nomGroupe')}>
          <input className="input" placeholder={t('actions.nomGroupePlaceholder')} autoComplete="off" autoCapitalize="words" autoCorrect="off" value={form.nom} onChange={set('nom')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('actions.cotisationParTour', { devise: settings.deviseSymbole })}>
            <input className="input" type="number" inputMode="decimal" min="0" step="1" autoComplete="off" placeholder="5000" value={form.montantCotisation} onChange={set('montantCotisation')} />
          </Field>
          <Field label={t('actions.periodeJours')}>
            <input className="input" type="number" inputMode="numeric" min="1" step="1" autoComplete="off" value={form.periodeJours} onChange={set('periodeJours')} />
          </Field>
        </div>
        <Field label={t('actions.datePremierTour')}>
          <input className="input" type="date" value={form.dateDebut} onChange={set('dateDebut')} />
        </Field>
        <button
          type="button"
          className="mb-1 flex w-full items-center justify-between rounded-xl px-1 py-2 text-sm font-bold text-gray-500"
          onClick={() => setShowOptions((s) => !s)}
        >
          <span>Options avancées</span>
          <span className="text-xs font-semibold text-brand-600">{showOptions ? 'Masquer' : 'Afficher'}</span>
        </button>
        {showOptions && (
          <>
            <label className="mb-3 flex items-center justify-between rounded-xl border border-gray-200 px-3.5 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">{t('actions.receveurCotonise')}</p>
                <p className="text-xs text-gray-400">{t('actions.receveurCotoniseHint')}</p>
              </div>
              <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={form.leReceveurCotonise} onChange={set('leReceveurCotonise')} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('actions.penalitePctJour')}>
                <input className="input" type="number" inputMode="decimal" min="0" max="100" step="0.1" autoComplete="off" value={form.penalitePctParJour} onChange={set('penalitePctParJour')} />
              </Field>
              <Field label={t('actions.plafond')}>
                <input className="input" type="number" inputMode="decimal" min="0" step="1" autoComplete="off" value={form.penalitePlafond} onChange={set('penalitePlafond')} />
              </Field>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={joinOpen}
        onClose={fermerRejoindre}
        title={t('nav.rejoindreGroupe')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={fermerRejoindre}>
              {t('commun.annuler')}
            </button>
            <button className="btn btn-primary" onClick={submitJoin} disabled={!joinCode.trim() || (!joinNom.trim() && !utilisateur) || joinBusy || !enLigne}>
              <UserPlus size={16} /> {joinBusy ? t('actions.recherche') : t('actions.rejoindre')}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-gray-600">
          {t('actions.rejoindreTexte')}
        </p>

        {utilisateur ? (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-success-200 bg-success-50 p-3">
            {utilisateur.photoURL ? (
              <img src={utilisateur.photoURL} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {(utilisateur.displayName || utilisateur.email || 'G')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-success-800">{utilisateur.displayName || t('actions.compteGoogle')}</p>
              <p className="truncate text-xs text-success-700">{utilisateur.email}</p>
            </div>
            <span className="badge bg-success-100 text-success-700">{t('actions.connecte')}</span>
          </div>
        ) : (
          <button className="btn btn-primary mb-3 w-full" onClick={connexionGoogleJoin} disabled={joinBusy}>
            <LogIn size={16} /> {t('actions.seConnecterGoogleRejoindre')}
          </button>
        )}

        {mesGroupes.length > 0 && (
          <div className="mb-3 overflow-hidden rounded-xl border border-gray-200">
            <p className="px-3 pt-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">
              {t('actions.groupesLies', { n: mesGroupes.length })}
            </p>
            <div className="divide-y divide-gray-100">
              {mesGroupes.map((mg) => {
                const present = groups.some((g) => g.codeUnique === mg.code)
                return (
                  <div key={mg.code} className="flex items-center gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-700">{mg.nom}</p>
                      <p className="font-mono text-[11px] tracking-widest text-gray-400">{mg.code}</p>
                    </div>
                    {present ? (
                      <span className="text-xs font-semibold text-success-600">{t('actions.present')}</span>
                    ) : (
                      <button className="btn btn-secondary !px-3 !py-1.5 text-xs" onClick={() => rejoindreDepuisCompte(mg.code)} disabled={joinBusy}>
                        {t('actions.rejoindre')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="mb-3 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('actions.ouAvecCode')}</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <Field label={t('actions.codeInvitation')}>
          <input
            className="input text-center font-mono text-2xl font-extrabold uppercase tracking-[0.5em]"
            type="text"
            inputMode="text"
            maxLength={6}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="••••••"
            value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '')); setJoinErr('') }}
          />
        </Field>
        <Field label={t('actions.nomComplet')}>
          <input className="input" type="text" autoComplete="name" autoCapitalize="words" autoCorrect="off" placeholder={t('actions.nomCompletPlaceholder')} value={joinNom} onChange={(e) => setJoinNom(e.target.value)} />
        </Field>
        <Field label={t('actions.telephone')} hint={t('actions.telephoneHint')}>
          <input className="input" type="tel" inputMode="tel" autoComplete="tel" autoCapitalize="off" placeholder={t('actions.telephonePlaceholder')} value={joinTel} onChange={(e) => setJoinTel(e.target.value)} />
        </Field>
        {joinErr && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-600">
            <AlertCircle size={16} /> {joinErr}
          </div>
        )}
      </Modal>
    </ActionsContext.Provider>
  )
}
