import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Share } from '@capacitor/share'
import { Capacitor } from '@capacitor/core'
import {
  ArrowLeft, Users, UserCog, Wallet, Palette, Languages, BellRing,
  MessageCircle, UserPlus, Gift, Shield, KeyRound, Fingerprint,
  Download, Save, FileText, LifeBuoy, Share2, LogOut, ChevronDown,
  CloudSun, Feather, Trash2, Volume2,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { getSettings, saveSettingsLocal } from '../lib/format'
import { programmerRappelsLocaux } from '../lib/rappelLocal'
import { VERSION_APP } from '../lib/version'
import { usePin } from '../context/PinContext'
import { useAuth } from '../context/AuthContext'
import { useWeatherTheme } from '../context/WeatherContext'
import { appliquerAnimationsReduites } from '../lib/theme'
import { useToast } from '../context/ToastContext'
import { t, useLangue, setLangue } from '../lib/i18n'
import { haptic } from '../lib/haptique'
import { exporterHistoriqueCSV, exporterBilanPDF } from '../lib/export'
import SettingsNotifications from '../components/settings/SettingsNotifications'
import SettingsSms from '../components/settings/SettingsSms'
import SettingsBienvenue from '../components/settings/SettingsBienvenue'
import SettingsSauvegarde from '../components/settings/SettingsSauvegarde'
import ToggleRow from '../components/settings/ToggleRow'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import { choisirPhoto } from '../lib/photo'
import { supprimerCompte } from '../lib/cloudApi'
import { effacerDonneesLocales } from '../lib/storage'

const DEVISES = ['FCFA', '€', '$', 'GHS', 'NGN']

function SectionTitle({ children }) {
  return (
    <p className="mb-2 mt-5 px-1 text-[11px] font-bold uppercase tracking-wide text-[var(--accent)] first:mt-0">
      {children}
    </p>
  )
}

function Section({ icon: Icon, title, subtitle, action, badge, children, ouvert, onToggle }) {
  return (
    <div className="card mb-3 overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-[var(--accent)]">
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-[var(--text)]">{title}</span>
          {subtitle && <span className="block truncate text-xs text-[var(--text-muted)]">{subtitle}</span>}
        </span>
        {badge && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge === 'ON' ? 'bg-success-500/10 text-[var(--success)]' : 'bg-brand-500/10 text-[var(--text-dim)]'}`}>
            {badge}
          </span>
        )}
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-[var(--accent)]">{action}</span>
        <ChevronDown size={18} className={`shrink-0 text-[var(--text-muted)] ${ouvert ? 'rotate-180' : ''}`} />
      </button>
      {ouvert && <div className="border-t border-[var(--border)] px-4 py-4">{children}</div>}
    </div>
  )
}

export default function SettingsScreen({ maj }) {
  const navigate = useNavigate()
  const { refresh, groups } = useData()
  const {
    verrouiller, pinActive, biometrieActive,
    activerPin, desactiverPin, changerPin, activerBiometrie, desactiverBiometrie,
  } = usePin()
  const { utilisateur, deconnecter, setPhotoProfil } = useAuth()
  const { actif: meteoActif, basculer: basculerMeteo, meta } = useWeatherTheme()
  const langue = useLangue()
  const toast = useToast()
  const [s, setS] = useState(() => getSettings())
  const [ouvert, setOuvert] = useState({})
  const [modalPin, setModalPin] = useState(null) // 'activer' | 'changer' | 'desactiver'
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [modalSuppr, setModalSuppr] = useState(false)
  const [mdpSuppr, setMdpSuppr] = useState('')
  const [accSuppr, setAccSuppr] = useState(false)
  const [supprEnCours, setSupprEnCours] = useState(false)

  const patchS = (arg) => {
    setS((prev) => {
      const next = typeof arg === 'function' ? arg(prev) : { ...prev, ...arg }
      saveSettingsLocal(next)
      if (next.recapQuotidienActif !== prev.recapQuotidienActif) programmerRappelsLocaux()
      return next
    })
    refresh()
  }
  const set = (k) => (e) => patchS({ [k]: e.target.value })
  const toggleSection = (id) => setOuvert((o) => ({ ...o, [id]: !o[id] }))
  const actifParDefaut = (v) => v !== false

  const surDeconnexion = async () => {
    await deconnecter()
    navigate('/')
  }

  const confirmSuppression = async () => {
    setSupprEnCours(true)
    try {
      await supprimerCompte(mdpSuppr)
      await deconnecter()
      effacerDonneesLocales()
      setModalSuppr(false)
      toast.success(t('suppr.reussi'))
      navigate('/')
    } catch (e) {
      toast.error((e && e.message) || 'Suppression impossible')
    } finally {
      setSupprEnCours(false)
      setMdpSuppr('')
      setAccSuppr(false)
    }
  }

  const changerPhoto = async () => {
    const data = await choisirPhoto()
    if (data) {
      if (setPhotoProfil) setPhotoProfil(data)
      refresh()
    }
  }

  const validerPin = async () => {
    if (modalPin === 'activer') {
      if (!/^\d{4,6}$/.test(pin1)) {
        toast.error('Code à 4 à 6 chiffres requis')
        return
      }
      await activerPin(pin1)
      toast.success('Code PIN activé')
    } else if (modalPin === 'changer') {
      if (!(await changerPin(pin1, pin2))) {
        toast.error('Ancien code incorrect')
        return
      }
      toast.success('Code PIN modifié')
    } else if (modalPin === 'desactiver') {
      if (!(await desactiverPin(pin1))) {
        toast.error('Code incorrect')
        return
      }
      toast.info('Code PIN désactivé')
    }
    setModalPin(null)
    setPin1('')
    setPin2('')
    haptic.success()
  }

  const inviterAmis = async () => {
    const texte = `Rejoins-moi sur Tontine Manager — gère ta tontine simplement 🤝

Cotisations, tours, rappels, IA intégrée.

Lien de téléchargement : https://tontine-manager.pages.dev`
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: 'Tontine Manager', text: texte, dialogTitle: 'Inviter un ami' })
        return
      }
    } catch {
      // fallback web
    }
    if (navigator.share) {
      navigator.share({ title: 'Tontine Manager', text: texte }).catch(() => {})
      return
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(texte).then(
        () => toast.success("Message d'invitation copié"),
        () => toast.info(texte)
      )
    } else {
      toast.info(texte)
    }
    haptic.tap()
  }

  const premierGroupe = groups && groups[0]
  const exporter = (fn, label) => {
    if (!premierGroupe) {
      toast.error("Créez d'abord une tontine")
      return
    }
    fn(premierGroupe.id)
    toast.success(label + ' en préparation')
    haptic.tap()
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-4 pt-safe">
      <div className="mb-5 flex items-center gap-3">
        <button className="btn btn-icon" onClick={() => navigate('/')} aria-label="Retour">
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-serif text-xl font-bold text-[var(--text)]">{t('settings.titre')}</h1>
      </div>

      {/* Ordre de lecture : qui je suis → comment ça se voit → ma tontine →
          mes données → aide → ce qui ne se annule pas. Le compte et la devise
          passent avant l'apparence, la zone destructive est dernière. */}
      <SectionTitle>{t('settings.general')}</SectionTitle>

      <Section
        icon={UserCog}
        title="Compte"
        subtitle="Votre profil et photo"
        action="Modifier"
        ouvert={!!ouvert.compte}
        onToggle={() => toggleSection('compte')}
      >
        <div className="flex items-center gap-3">
          <Avatar src={utilisateur?.photoURL} nom={utilisateur?.displayName || utilisateur?.email || 'Moi'} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-[var(--text)]">{utilisateur?.displayName || 'Mon compte'}</p>
            {utilisateur?.email && <p className="truncate text-xs text-[var(--text-muted)]">{utilisateur.email}</p>}
          </div>
        </div>
        <button className="btn btn-secondary mt-3 w-full" onClick={changerPhoto}>
          Changer la photo
        </button>
      </Section>

      <Section
        icon={Wallet}
        title="Devise & format"
        subtitle={`${s.deviseSymbole || 'FCFA'} · JJ/MM/AAAA`}
        action="Modifier"
        ouvert={!!ouvert.langue}
        onToggle={() => toggleSection('langue')}
      >
        <div className="space-y-3">
          <div>
            <label className="label">Devise</label>
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={s.deviseSymbole || 'FCFA'} onChange={set('deviseSymbole')}>
                {DEVISES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select className="input" value={s.devisePosition || 'after'} onChange={set('devisePosition')}>
                <option value="after">Après le montant</option>
                <option value="before">Avant le montant</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Format de date</label>
            <input className="input" value="JJ/MM/AAAA" readOnly />
          </div>
        </div>
      </Section>

      <Section
        icon={Languages}
        title={t('settings.apparence')}
        subtitle={`${t('settings.langue')} · ${langue === 'fr' ? 'Français' : 'English'}`}
        action={t('settings.modifier')}
        ouvert={!!ouvert.apparence}
        onToggle={() => toggleSection('apparence')}
      >
        <div className="space-y-3">
          <div>
            <label className="label">{t('settings.langue')}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`rounded-xl border-2 px-3 py-2.5 text-sm font-bold ${langue === 'fr' ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]' : 'border-[var(--border)] bg-surface text-[var(--text-muted)]'}`}
                onClick={() => { setLangue('fr'); haptic.tap() }}
              >
                Français
              </button>
              <button
                className={`rounded-xl border-2 px-3 py-2.5 text-sm font-bold ${langue === 'en' ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]' : 'border-[var(--border)] bg-surface text-[var(--text-muted)]'}`}
                onClick={() => { setLangue('en'); haptic.tap() }}
              >
                English
              </button>
            </div>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">{t('settings.langueAstuce')}</p>
          <ToggleRow
            icon={Volume2}
            title="Son d'ouverture"
            subtitle="Petit carillon joué au lancement de l'application"
            checked={s.sonOuverture !== false}
            onChange={() => patchS({ sonOuverture: s.sonOuverture === false })}
          />
        </div>
      </Section>

      <Section
        icon={Palette}
        title="Thème dynamique"
        subtitle={meteoActif ? `${meta.icon} ${meta.hue}` : 'Thème fixe charte accueil'}
        action="Régler"
        ouvert={!!ouvert.theme}
        onToggle={() => toggleSection('theme')}
      >
        <div className="space-y-3">
          <ToggleRow
            icon={CloudSun}
            title="Thème météo & heure"
            subtitle="Couleurs dynamiques selon la météo et l'heure de la journée"
            checked={meteoActif}
            onChange={() => {
              basculerMeteo(!meteoActif)
              haptic.tap()
            }}
          />
          {meteoActif && (
            <div className="rounded-xl bg-brand-500/5 p-3">
              <p className="text-xs font-semibold text-[var(--accent)]">{meta.icon} {meta.hue}</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Les couleurs changent automatiquement. Rafraîchissement toutes les 30 min.
              </p>
            </div>
          )}
          <ToggleRow
            icon={Feather}
            title="Mode léger"
            subtitle="Supprime le fond décoratif flou pour économiser batterie et données sur les téléphones modestes"
            checked={!!s.animationsReduites}
            onChange={() => {
              const next = !s.animationsReduites
              patchS({ animationsReduites: next })
              appliquerAnimationsReduites(next)
              haptic.tap()
            }}
          />
          <p className="text-[11px] text-[var(--text-muted)]">
            Utilise votre position et la météo (OpenWeatherMap) pour adapter les couleurs.
          </p>
        </div>
      </Section>

      <SectionTitle>{t('settings.votreTontine')}</SectionTitle>

      <Section
        icon={Users}
        title="Membres"
        subtitle="Ajouter et gérer les gens du groupe"
        action="Régler"
        ouvert={!!ouvert.people}
        onToggle={() => toggleSection('people')}
      >
        <SettingsSms s={s} set={set} />
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <SettingsBienvenue s={s} setS={patchS} />
        </div>
      </Section>

      <Section
        icon={BellRing}
        title="Notifications"
        subtitle="Ce que vous voulez recevoir"
        action="Régler"
        ouvert={!!ouvert.notifs}
        onToggle={() => toggleSection('notifs')}
      >
        <div>
          <SettingsNotifications enLigne={true} />
          <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
            <p className="text-xs font-bold text-[var(--text-dim)]">Types d'événements</p>
            <ToggleRow
              icon={MessageCircle}
              title="Messages de discussion"
              subtitle="Nouveaux messages du groupe"
              checked={actifParDefaut(s.notifDiscussion)}
              onChange={() => patchS((prev) => ({ notifDiscussion: !actifParDefaut(prev.notifDiscussion) }))}
            />
            <ToggleRow
              icon={UserPlus}
              title="Nouveaux membres"
              subtitle="Quelqu'un rejoint la tontine"
              checked={actifParDefaut(s.notifMembres)}
              onChange={() => patchS((prev) => ({ notifMembres: !actifParDefaut(prev.notifMembres) }))}
            />
            <ToggleRow
              icon={Gift}
              title="Distribution du pot"
              subtitle="Le bénéficiaire a reçu son tour"
              checked={actifParDefaut(s.notifDistribution)}
              onChange={() => patchS((prev) => ({ notifDistribution: !actifParDefaut(prev.notifDistribution) }))}
            />
            <p className="text-[11px] text-[var(--text-muted)]">Préférences enregistrées sur cet appareil.</p>
          </div>
        </div>
      </Section>

      <SectionTitle>{t('settings.donneesSecurite')}</SectionTitle>

      <Section
        icon={Shield}
        title="Sécurité"
        subtitle={pinActive ? 'Verrouillage par PIN configuré' : 'Protégez l’accès avec un code PIN'}
        action={pinActive ? 'Régler' : 'Activer'}
        badge={pinActive ? 'ON' : undefined}
        ouvert={!!ouvert.securite}
        onToggle={() => toggleSection('securite')}
      >
        <div className="space-y-2">
          {pinActive ? (
            <>
              <ToggleRow
                icon={KeyRound}
                title="Code PIN au démarrage"
                subtitle="Demandé à chaque ouverture de l'app — toucher pour désactiver"
                checked={true}
                onChange={() => { setModalPin('desactiver'); setPin1('') }}
              />
              <ToggleRow
                icon={Fingerprint}
                title="Déverrouillage biométrique"
                subtitle="Empreinte ou reconnaissance du visage"
                checked={!!biometrieActive}
                onChange={() => {
                  if (biometrieActive) desactiverBiometrie()
                  else { activerBiometrie(); toast.success('Biométrie activée') }
                  haptic.tap()
                }}
              />
              <button
                className="btn btn-secondary w-full !py-2 text-sm"
                onClick={() => { setModalPin('changer'); setPin1(''); setPin2('') }}
              >
                <KeyRound size={15} /> Changer le code PIN
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary w-full !py-2 text-sm"
              onClick={() => { setModalPin('activer'); setPin1('') }}
            >
              <KeyRound size={15} /> Activer le code PIN
            </button>
          )}
          <button className="btn btn-primary w-full !py-2 text-sm" onClick={() => verrouiller()}>
            <KeyRound size={15} /> Verrouiller maintenant
          </button>
          <p className="text-[11px] text-[var(--text-muted)]">
            L'app gère de l'argent réel : un code PIN empêche une autre personne d'ouvrir vos tontines.
          </p>
        </div>
      </Section>

      <Section
        icon={Save}
        title={t('settings.sauvegarde')}
        subtitle={t('settings.sauvegardeSousTitre')}
        action={t('settings.ouvrir')}
        ouvert={!!ouvert.sauvegarde}
        onToggle={() => toggleSection('sauvegarde')}
      >
        <SettingsSauvegarde refresh={refresh} />
      </Section>

      <Section
        icon={Download}
        title="Exporter mes données"
        subtitle="Historique des paiements et reçus"
        action="Exporter"
        ouvert={!!ouvert.exportData}
        onToggle={() => toggleSection('exportData')}
      >
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-secondary !py-2 text-xs" onClick={() => exporter(exporterHistoriqueCSV, 'CSV')}>
            Historique (CSV)
          </button>
          <button className="btn btn-secondary !py-2 text-xs" onClick={() => exporter(exporterBilanPDF, 'PDF')}>
            Bilan (PDF)
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          {premierGroupe ? `Tontine exportée : « ${premierGroupe.nom} ».` : 'Créez une tontine pour exporter ses données.'}
        </p>
      </Section>

      <Section
        icon={FileText}
        title={t('confid.titre')}
        subtitle="Vos données restent chez vous"
        action={t('confid.ouvrir')}
        ouvert={!!ouvert.confid}
        onToggle={() => {
          toggleSection('confid')
        }}
      >
        <p className="text-xs leading-relaxed text-[var(--text-dim)]">
          Tontine Manager enregistre vos groupes sur cet appareil et, si vous activez la synchronisation,
          dans votre espace personnel. Aucune donnée n'est vendue ni partagée. L'argent ne transite jamais
          par l'application : chaque membre envoie sa cotisation sur le lien de paiement Money Fusion du responsable.
        </p>
        <button
          className="btn btn-secondary mt-3 w-full !py-2 text-xs"
          onClick={() => navigate('/confidentialite')}
        >
          {t('confid.ouvrir')}
        </button>
      </Section>

      <SectionTitle>{t('settings.support')}</SectionTitle>

      <Section
        icon={LifeBuoy}
        title="Aide & support"
        subtitle="FAQ, guide de démarrage, contact"
        action="Ouvrir"
        ouvert={false}
        onToggle={() => navigate('/aide')}
      />

      <Section
        icon={Share2}
        title="Inviter des amis"
        subtitle="Partager l'app avec votre groupe"
        action="Partager"
        ouvert={false}
        onToggle={inviterAmis}
      />

      <SectionTitle>{t('settings.zoneSensible')}</SectionTitle>

      <Section
        icon={Trash2}
        title={t('settings.supprimerCompte')}
        subtitle={t('settings.supprimerCompteSousTitre')}
        action={t('commun.supprimer')}
        ouvert={false}
        onToggle={() => {
          setMdpSuppr('')
          setAccSuppr(false)
          setModalSuppr(true)
        }}
      />

      <button
        onClick={surDeconnexion}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-[rgba(217,112,82,0.3)] bg-[rgba(217,112,82,0.08)] py-3 text-sm font-bold text-[var(--error)]"
      >
        <LogOut size={16} /> Déconnexion
      </button>
      <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">
        Vous allez perdre l'accès aux notifications
      </p>

      <div className="mt-6 text-center">
        <p className="text-xs text-[var(--text-muted)]">Tontine Manager v{VERSION_APP}</p>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t('settings.footer')}</p>
      </div>



      <Modal
        open={modalSuppr}
        onClose={() => setModalSuppr(false)}
        title={t('suppr.titre')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalSuppr(false)} disabled={supprEnCours}>
              {t('commun.annuler')}
            </button>
            <button
              className="btn btn-primary !bg-[var(--error)]"
              onClick={confirmSuppression}
              disabled={!accSuppr || supprEnCours}
            >
              {supprEnCours ? t('suppr.enCours') : t('suppr.confirmer')}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs leading-relaxed text-[var(--error)]">{t('suppr.avertissement')}</p>
          <div>
            <label className="label" htmlFor="mdp-suppr">{t('suppr.mdp')}</label>
            <input
              id="mdp-suppr"
              className="input"
              type="password"
              autoComplete="current-password"
              value={mdpSuppr}
              onChange={(e) => setMdpSuppr(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t('suppr.mdpAide')}</p>
          </div>
          <label className="flex min-h-11 items-start gap-2.5 text-xs text-[var(--text-dim)]">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
              checked={accSuppr}
              onChange={(e) => setAccSuppr(e.target.checked)}
            />
            {t('suppr.case')}
          </label>
        </div>
      </Modal>

      <Modal
        open={!!modalPin}
        onClose={() => setModalPin(null)}
        title={modalPin === 'activer' ? 'Choisir un code PIN' : modalPin === 'changer' ? 'Changer le code PIN' : 'Désactiver le code PIN'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalPin(null)}>Annuler</button>
            <button
              className="btn btn-primary"
              onClick={validerPin}
              disabled={!modalPin || pin1.length < 4 || (modalPin === 'changer' && pin2.length < 4)}
            >
              Valider
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="label">{modalPin === 'changer' ? 'Ancien code' : 'Code (4 à 6 chiffres)'}</label>
            <input
              className="input text-center text-xl tracking-[0.5em]"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              spellCheck={false}
              maxLength={6}
              value={pin1}
              onChange={(e) => setPin1(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
            />
          </div>
          {modalPin === 'changer' && (
            <div>
              <label className="label">Nouveau code</label>
              <input
                className="input text-center text-xl tracking-[0.5em]"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                spellCheck={false}
                maxLength={6}
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
              />
            </div>
          )}
          {modalPin === 'desactiver' && (
            <p className="text-xs text-[var(--error)]">
              Sans code PIN, quiconque déverrouille votre téléphone peut accéder à vos tontines.
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
