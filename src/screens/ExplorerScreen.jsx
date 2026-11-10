import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Coins, Compass, Loader2, RefreshCw, UserPlus, Users } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { useConnection } from '../context/ConnectionContext'
import { useToast } from '../context/ToastContext'
import { chargerGroupesPublics, envoyerDemande } from '../lib/sync'
import { formatMontant } from '../lib/format'
import { t, useLangue } from '../lib/i18n'
import { haptic } from '../lib/haptique'
import Modal from '../components/Modal'
import Field from '../components/Field'
import EmptyState from '../components/EmptyState'

const DEMANDES_KEY = 'tontine_explorer_demandes'

export default function ExplorerScreen() {
  const navigate = useNavigate()
  const { groups } = useData()
  const { enLigne } = useConnection()
  const { utilisateur } = useAuth()
  const toast = useToast()
  useLangue()

  const [groupes, setGroupes] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [demandes, setDemandes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(DEMANDES_KEY) || '{}')
    } catch {
      return {}
    }
  })
  const [groupeChoisi, setGroupeChoisi] = useState(null)
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [erreurModal, setErreurModal] = useState('')
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    setNom((v) => v || (utilisateur && utilisateur.displayName) || '')
  }, [utilisateur])

  const charger = useCallback(async () => {
    if (!enLigne) {
      setErreur(t('explorer.horsLigne'))
      setChargement(false)
      return
    }
    setChargement(true)
    setErreur('')
    try {
      const liste = await chargerGroupesPublics()
      setGroupes(Array.isArray(liste) ? liste : [])
    } catch (e) {
      setErreur(e.message === 'auth' ? t('explorer.erreurAuth') : t('explorer.erreurChargement'))
    } finally {
      setChargement(false)
    }
  }, [enLigne])

  useEffect(() => {
    charger()
  }, [charger])

  const dejaRejoint = (code) =>
    !!groups.find((g) => g.codeUnique && code && String(g.codeUnique).toUpperCase() === String(code).toUpperCase())

  const memoriserDemandes = (map) => {
    setDemandes(map)
    try {
      localStorage.setItem(DEMANDES_KEY, JSON.stringify(map))
    } catch { /* ignore */ }
  }

  const ouvrirAdhesion = (groupe) => {
    if (dejaRejoint(groupe.codeUnique)) return
    setGroupeChoisi(groupe)
    setNom(utilisateur && utilisateur.displayName ? utilisateur.displayName : '')
    setTelephone('')
    setErreurModal('')
    haptic.tap()
  }

  const envoyer = async () => {
    if (envoi || !groupeChoisi) return
    const nomSaisi = nom.trim()
    if (!nomSaisi) {
      setErreurModal(t('explorer.nomRequis'))
      return
    }
    setEnvoi(true)
    setErreurModal('')
    try {
      await envoyerDemande(groupeChoisi.codeUnique, {
        nom: nomSaisi,
        telephone: telephone.trim(),
        email: utilisateur ? utilisateur.email : '',
        uid: utilisateur ? utilisateur.uid : null,
        majLe: Date.now(),
      })
      memoriserDemandes({ ...demandes, [String(groupeChoisi.codeUnique)]: true })
      setGroupeChoisi(null)
      toast.success(t('explorer.demandeEnvoyeeOk'))
      haptic.tap()
    } catch (e) {
      setErreurModal(e.message === 'auth' ? t('explorer.erreurAuth') : t('explorer.demandeErreur'))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-4 pt-safe">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="btn btn-icon" onClick={() => navigate('/')} aria-label="Retour">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-bold text-[var(--text)]">{t('explorer.titre')}</h1>
        </div>
        <button className="btn btn-icon" onClick={() => charger()} aria-label={t('explorer.actualiser')} title={t('explorer.actualiser')}>
          <RefreshCw size={18} />
        </button>
      </div>

      {!utilisateur && (
        <div className="card mb-4 p-4">
          <p className="text-sm text-[var(--text-dim)]">{t('explorer.connexionRequise')}</p>
          <button className="btn btn-primary mt-3" onClick={() => navigate('/connexion')}>
            {t('explorer.seConnecter')}
          </button>
        </div>
      )}

      {erreur && <div className="card mb-4 p-4 text-sm text-[var(--error)]">{erreur}</div>}

      {chargement ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
          <Loader2 size={28} />
          <p className="mt-3 text-sm">{t('explorer.chargement')}</p>
        </div>
      ) : groupes.length === 0 ? (
        <EmptyState icon={Compass} title={t('explorer.videTitre')} description={t('explorer.videTexte')} />
      ) : (
        <div className="space-y-2">
          {groupes.map((groupe) => {
            const rejoint = dejaRejoint(groupe.codeUnique)
            const demandeEnvoyee = !rejoint && !!demandes[String(groupe.codeUnique)]
            return (
              <div key={String(groupe.codeUnique)} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--text)]">{groupe.nom}</p>
                    {groupe.description ? (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{groupe.description}</p>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{t('explorer.pasDescription')}</p>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                    {groupe.codeUnique}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-dim)]">
                  <span className="inline-flex items-center gap-1">
                    <Users size={13} />{' '}
                    {(groupe.nbMembres ?? 0) <= 1
                      ? t('explorer.membres', { n: groupe.nbMembres ?? 0 })
                      : t('explorer.membresPluriel', { n: groupe.nbMembres ?? 0 })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Coins size={13} />{' '}
                    {formatMontant(groupe.montantCotisation ?? 0, {
                      deviseSymbole: groupe.deviseSymbole || 'FCFA',
                      devisePosition: groupe.devisePosition || 'after',
                    })}{' '}
                    / {groupe.periodeJours ?? 7} {t('explorer.jours')}
                  </span>
                </div>
                <div className="mt-3">
                  {rejoint ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(201,151,63,0.1)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]">
                      <CheckCircle2 size={14} /> {t('explorer.dejaRejoint')}
                    </span>
                  ) : demandeEnvoyee ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(201,151,63,0.1)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]">
                      <CheckCircle2 size={14} /> {t('explorer.demandeEnvoyee')}
                    </span>
                  ) : (
                    <button className="btn btn-primary w-full" onClick={() => ouvrirAdhesion(groupe)}>
                      <UserPlus size={16} /> {t('explorer.demanderAdhesion')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={!!groupeChoisi}
        onClose={() => setGroupeChoisi(null)}
        title={groupeChoisi ? t('explorer.adhererTitre', { nom: groupeChoisi.nom }) : ''}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setGroupeChoisi(null)} disabled={envoi}>
              {t('explorer.annuler')}
            </button>
            <button className="btn btn-primary" onClick={envoyer} disabled={envoi}>
              {envoi ? <Loader2 size={16} /> : <UserPlus size={16} />}
              {t('explorer.envoyer')}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-[var(--text-dim)]">{t('explorer.modalTexte')}</p>
        <Field label={t('explorer.votreNom')}>
          <input className="input" type="text" autoComplete="name" autoCapitalize="words" autoCorrect="off" spellCheck={false} value={nom} onChange={(e) => setNom(e.target.value)} placeholder={t('explorer.votreNomPlaceholder')} />
        </Field>
        <div className="mt-3">
          <Field label={t('explorer.telephone')}>
            <input className="input" type="tel" inputMode="tel" autoComplete="tel" autoCapitalize="off" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="+225 …" />
          </Field>
        </div>
        {erreurModal && <p className="mt-3 text-sm text-[var(--error)]">{erreurModal}</p>}
      </Modal>
    </div>
  )
}
