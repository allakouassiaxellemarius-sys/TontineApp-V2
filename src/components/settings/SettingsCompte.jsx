import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cloud, LogIn, LogOut, UploadCloud, Wallet, Users, AlertTriangle, CheckCircle2, Mail } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { sauvegarderCompte, restaurerCompte, restaurerMesGroupes } from '../../lib/syncEngine'
import { getGroups, getMembres, getParticipationMembre } from '../../lib/db'
import { formatMontant } from '../../lib/format'
import SectionCard from './SectionCard'

function ProfilStats() {
  const { utilisateur } = useAuth()
  if (!utilisateur) return null
  const entrees = getGroups()
    .flatMap((g) => getMembres(g.id))
    .filter((m) => m.uid && m.uid === utilisateur.uid)
    .map((m) => getParticipationMembre(m.groupeId, m.id))
    .filter(Boolean)
  if (!entrees.length) {
    return (
      <div className="mt-3 rounded-xl bg-gray-50 px-3.5 py-3">
        <p className="text-xs text-gray-400">
          Vous n'apparaissez pas encore dans une tontine liée à ce compte. Connectez-vous en tant que membre
          (via le code d'invitation) pour retrouver ici votre historique de participation.
        </p>
      </div>
    )
  }
  const totalCotise = entrees.reduce((s, e) => s + e.montantCotise, 0)
  const totalRecu = entrees.reduce((s, e) => s + e.montantRecu, 0)
  const nbCotisations = entrees.reduce((s, e) => s + e.nbCotisations, 0)
  const nbRetards = entrees.reduce((s, e) => s + e.nbEnRetard, 0)
  const nbPots = entrees.reduce((s, e) => s + e.potsRecus.length, 0)
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Mon profil · participation</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-brand-50 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-brand-600"><Users size={11} /> Tontines</p>
          <p className="mt-0.5 text-sm font-extrabold text-gray-800">{entrees.length}</p>
        </div>
        <div className="rounded-xl bg-success-50 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-success-600"><Wallet size={11} /> Total cotisé</p>
          <p className="mt-0.5 truncate text-sm font-extrabold text-gray-800">{formatMontant(totalCotise)}</p>
        </div>
        <div className="rounded-xl bg-info-50 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-info-600"><CheckCircle2 size={11} /> Versements</p>
          <p className="mt-0.5 text-sm font-extrabold text-gray-800">{nbCotisations}</p>
        </div>
        <div className="rounded-xl bg-warning-50 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-warning-600"><AlertTriangle size={11} /> En retard</p>
          <p className="mt-0.5 text-sm font-extrabold text-gray-800">{nbRetards}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        {nbPots} pot{nbPots > 1 ? 's' : ''} reçu{nbPots > 1 ? 's' : ''} · Net reçu {formatMontant(totalRecu)}.
      </p>
    </div>
  )
}

export default function SettingsCompte({ refresh, modeHorsLigne }) {
  const { utilisateur, erreur: authErreur, connecter, deconnecter } = useAuth()
  const navigate = useNavigate()
  const [compteMsg, setCompteMsg] = useState('')
  const [compteBusy, setCompteBusy] = useState(false)

  const seConnecter = async () => {
    setCompteMsg('')
    const u = await connecter()
    if (!u) {
      setCompteMsg(authErreur || 'Connexion impossible.')
      return
    }
    setCompteMsg('Connecté ✓ — restauration de vos tontines…')
    const [nb1, nb2] = await Promise.all([restaurerCompte(u.uid), restaurerMesGroupes(u.uid)])
    refresh()
    const total = nb1 + nb2
    setCompteMsg(total > 0 ? `Connecté ✓ — ${total} tontine(s) restaurée(s).` : 'Connecté ✓ — compte prêt.')
  }

  const sauvegarder = async () => {
    setCompteBusy(true)
    setCompteMsg('')
    const uid = utilisateur ? utilisateur.uid : null
    const nb = await sauvegarderCompte(uid)
    refresh()
    setCompteBusy(false)
    setCompteMsg(nb > 0 ? `${nb} tontine(s) sauvegardée(s) sur votre compte.` : 'Aucune tontine synchronisée à sauvegarder.')
  }

  const seDeconnecter = async () => {
    await deconnecter()
    refresh()
    setCompteMsg('')
  }

  return (
    <SectionCard icon={Cloud} title="Compte Google">
      {!utilisateur ? (
        <>
          <p className="mb-3 text-xs text-gray-400">
            Connectez-vous avec votre compte Google pour sauvegarder vos tontines dans le cloud et les
            retrouver sur un autre appareil. Le code d'invitation continue de fonctionner pour partager.
          </p>
          <button className="btn btn-secondary w-full" onClick={seConnecter} disabled={modeHorsLigne || compteBusy}>
            <LogIn size={15} /> {compteBusy ? 'Connexion…' : 'Se connecter avec Google'}
          </button>
          <button className="btn btn-secondary mt-2 w-full" onClick={() => navigate('/connexion')} disabled={modeHorsLigne || compteBusy}>
            <Mail size={15} /> Se connecter avec email
          </button>
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-gray-50 px-3.5 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <Cloud size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-800">{utilisateur.displayName || 'Compte Google'}</p>
              <p className="truncate text-xs text-gray-400">{utilisateur.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-primary !px-2 text-xs" onClick={sauvegarder} disabled={modeHorsLigne || compteBusy}>
              <UploadCloud size={15} /> {compteBusy ? '…' : 'Sauvegarder'}
            </button>
            <button className="btn btn-secondary !px-2 text-xs" onClick={seDeconnecter} disabled={compteBusy}>
              <LogOut size={15} /> Se déconnecter
            </button>
          </div>
          <ProfilStats />
        </>
      )}
      {(compteMsg || authErreur) && (
        <p className="mt-3 text-center text-xs font-semibold text-success-600">{compteMsg || authErreur}</p>
      )}
    </SectionCard>
  )
}
