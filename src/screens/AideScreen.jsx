import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, PlusCircle, UserPlus, LayoutDashboard, Wallet, Users, CalendarDays, BellRing,
  History, Settings, Cloud, ShieldCheck, SlidersHorizontal, FileText, ChevronDown, ChevronUp, BookOpen,
} from 'lucide-react'
import Logo from '../components/Logo'

const SECTIONS = [
  {
    id: 'creer',
    icon: PlusCircle,
    titre: 'Créer une tontine',
    etapes: [
      'Appuyez sur « + Nouvelle tontine » en bas de l\u2019écran d\u2019accueil.',
      'La connexion à un compte Google est obligatoire pour créer une tontine (sauvegarde et partage).',
      'Renseignez le nom du groupe et la cotisation par tour.',
      'Choisissez la période (en jours) : c\u2019est l\u2019espace entre deux tours.',
      'Réglez la devise (symbole et position) ainsi que la date du premier tour.',
      'Définissez la pénalité de retard (en % par jour) et son plafond (en % de la cotisation).',
      'Décidez si le receveur du pot cotise aussi à son propre tour.',
      'Sélectionnez les moyens de paiement acceptés (Espèces, Orange Money, MTN MoMo, Moov Money, Wave).',
      'Validez : les tours sont générés automatiquement à partir de la date de début.',
    ],
    astuce: 'Tous ces réglages restent modifiables plus tard dans Réglages → Paramètres du groupe.',
  },
  {
    id: 'rejoindre',
    icon: UserPlus,
    titre: 'Rejoindre un groupe (code)',
    etapes: [
      'Le responsable génère un code d\u2019invitation dans Réglages → Partager / Inviter.',
      'Sur votre téléphone, appuyez sur « Rejoindre un groupe » dans le tableau de bord.',
      'Tapez le code reçu (ex. ABCD-1234).',
      'Une copie du groupe s\u2019importe en lecture seule : vous voyez l\u2019aperçu, les membres et les tours.',
      'Si la synchronisation est active chez le responsable, vos données se mettent à jour automatiquement.',
    ],
    astuce: 'Seuls les groupes dont le responsable a activé la synchronisation peuvent être rejoints.',
  },
  {
    id: 'accueil',
    icon: LayoutDashboard,
    titre: 'Tableau de bord (accueil)',
    etapes: [
      'Chaque tontine est une carte : nombre de membres, cotisation par tour, prochain tour et solde.',
      'Les badges indiquent l\u2019état : « Terminée » ou « Rejoint » (groupe importé par code).',
      'Appuyez sur une carte pour ouvrir la tontine et voir tous ses onglets.',
      'En haut, un indicateur vous prévient si vous êtes hors ligne.',
    ],
    astuce: 'Le bouton « Se connecter avec Google » apparaît automatiquement si vous tentez de créer sans compte.',
  },
  {
    id: 'apercu',
    icon: Wallet,
    titre: 'Onglet Aperçu',
    etapes: [
      'Consultez le solde du groupe : total cotisé, total reçu et différence.',
      'Voyez le montant du pot (cotisation × nombre de membres).',
      'Le membre receveur du prochain tour est indiqué, ainsi que son statut.',
      'Un raccourci permet d\u2019enregistrer directement les cotisations.',
    ],
    astuce: 'Le receveur est déterminé par l\u2019ordre de tirage au sort si vous l\u2019avez utilisé.',
  },
  {
    id: 'membres',
    icon: Users,
    titre: 'Onglet Membres',
    etapes: [
      'Ajoutez un membre avec son nom et son téléphone.',
      'Modifiez ou supprimez un membre via l\u2019icône crayon.',
      'Bloquez un membre pour l\u2019empêcher de recevoir le pot (icône de verrou).',
      'Le badge « Vous » signale le membre correspondant à votre compte connecté.',
    ],
    astuce: 'Un téléphone ne peut être utilisé que par un seul membre du groupe.',
  },
  {
    id: 'tours',
    icon: CalendarDays,
    titre: 'Onglet Tours',
    etapes: [
      'Les tours sont générés automatiquement, espacés de la période choisie.',
      'Chaque tour indique son numéro, sa date, le receveur et son statut.',
      'Modifiez la date d\u2019un tour avec l\u2019icône crayon : la date est enregistrée aussitôt.',
      'Les tours manquants peuvent être générés à partir de la dernière échéance.',
    ],
    astuce: 'Un tour marqué « reçu » passe au suivant ; les rappels suivent automatiquement.',
  },
  {
    id: 'paiements',
    icon: Wallet,
    titre: 'Onglet Paiements',
    etapes: [
      'Enregistrez une cotisation : choisissez le membre et le moyen de paiement.',
      'Les pénalités de retard se calculent automatiquement selon vos réglages.',
      'Le paiement du receveur est géré selon l\u2019option « le receveur cotise aussi ».',
      'Chaque paiement est ajouté à l\u2019historique.',
    ],
    astuce: 'Les montants sont pré-remplis à la cotisation du groupe.',
  },
  {
    id: 'rappels',
    icon: BellRing,
    titre: 'Onglet Rappels',
    etapes: [
      'Les tours à échoir s\u2019affichent avec le montant attendu.',
      'Envoyez un rappel WhatsApp : le message est préparé automatiquement.',
      'Les notifications locales (chaque matin à 8h) s\u2019activent dans Paramètres → Notifications.',
      'Les SMS automatiques sont optionnels (configuration Twilio).',
    ],
    astuce: 'Utilisez « Tester » dans Paramètres → Notifications pour vérifier que votre téléphone reçoit bien les alertes.',
  },
  {
    id: 'historique',
    icon: History,
    titre: 'Onglet Historique',
    etapes: [
      'Retrouvez le journal complet : cotisations, réceptions, pénalités.',
      'Chaque entrée montre le membre, le montant, le moyen de paiement et la date.',
      'Exportez cet historique en fichier Excel depuis Réglages → Export.',
    ],
    astuce: 'L\u2019historique est propre à chaque appareil, mais synchronisé avec les invités.',
  },
  {
    id: 'reglages',
    icon: Settings,
    titre: 'Onglet Réglages du groupe',
    etapes: [
      'Paramètres du groupe : nom, cotisation, période, devise, pénalités, date de début, receveur cotise, moyens de paiement.',
      'Le bouton « Enregistrer les modifications » reste affiché en bas de l\u2019écran.',
      'Partager / Inviter : générez le code, touchez-le pour le copier, ou envoyez-le par WhatsApp.',
      'Synchronisation en ligne : activez-la pour que les invités reçoivent vos mises à jour en direct.',
      'Export : Bilan PDF, Membres, Tours et Historique en Excel.',
    ],
    astuce: 'Un groupe synchronisé publie automatiquement ses changements ; les invités restent en lecture seule.',
  },
  {
    id: 'compte',
    icon: Cloud,
    titre: 'Compte Google',
    etapes: [
      'Paramètres → Compte Google : connectez-vous avec votre compte.',
      'Sauvegardez vos tontines dans le cloud pour les retrouver sur un autre appareil.',
      'Le bouton « Sauvegarder » publie vos groupes synchronisés.',
      'Déconnectez-vous pour arrêter la sauvegarde.',
    ],
    astuce: 'Le compte est requis pour créer une tontine et pour le push serveur.',
  },
  {
    id: 'securite',
    icon: ShieldCheck,
    titre: 'Sécurité (code PIN)',
    etapes: [
      'Paramètres → Sécurité → Activer : choisissez un code à 4 chiffres.',
      'L\u2019app se verrouille au démarrage et après verrouillage manuel.',
      'Changez ou désactivez le code à tout moment.',
      'En cas d\u2019oubli, l\u2019app est réinitialisée (données locales effacées).',
    ],
    astuce: 'Vos données restent sauvegardées dans le cloud si vous êtes connecté à Google.',
  },
  {
    id: 'notifications',
    icon: BellRing,
    titre: 'Notifications',
    etapes: [
      'Paramètres → Notifications → Activer : autorise et programme les rappels locaux.',
      'Les rappels locaux sonnent à 08h00 lorsqu\u2019un tour échoit aujourd\u2019hui ou demain.',
      '« Tester » envoie une notification de contrôle dans 2 secondes.',
      'Le push serveur (FCM) est optionnel : il exige un compte Google et le plan Blaze de Firebase.',
    ],
    astuce: 'Sur Android 13+, autorisez la notification dans les réglages du téléphone si le test n\u2019affiche rien.',
  },
  {
    id: 'globaux',
    icon: SlidersHorizontal,
    titre: 'Paramètres généraux',
    etapes: [
      'Devise par défaut (symbole et position) pour les nouvelles tontines.',
      'Nom du trésorier : signature des messages de rappel.',
      'Twilio (optionnel) : SID, token et numéro d\u2019envoi pour les SMS automatiques.',
      'Découverte : revoir le tutoriel de démarrage à tout moment.',
    ],
    astuce: 'Chaque tontine peut définir sa propre devise dans ses réglages.',
  },
  {
    id: 'exports',
    icon: FileText,
    titre: 'Exports',
    etapes: [
      'Réglages du groupe → Export : générez un bilan PDF récapitulatif.',
      'Exportez les membres, les tours ou l\u2019historique en CSV (ouvrables dans Excel / Google Sheets).',
      'Les fichiers sont partagés via l\u2019application de votre téléphone.',
    ],
    astuce: 'Les exports utilisent la devise du groupe.',
  },
]

export default function AideScreen() {
  const navigate = useNavigate()
  const [ouverte, setOuverte] = useState('creer')

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-4 pt-safe">
      <div className="mb-4 flex items-center gap-3">
        <button className="btn btn-icon" onClick={() => navigate('/parametres')} aria-label="Retour">
          <ArrowLeft size={18} />
        </button>
        <Logo size={34} className="shrink-0" />
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-gray-800">Aide &amp; tutoriel</h1>
          <p className="text-xs text-gray-400">Chaque fonction de l'app, expliquée pas à pas.</p>
        </div>
      </div>

      <div className="space-y-2">
        {SECTIONS.map((s) => {
          const estOuverte = ouverte === s.id
          const Icone = s.icon
          return (
            <div key={s.id} className="card overflow-hidden !p-0">
              <button
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                onClick={() => setOuverte(estOuverte ? '' : s.id)}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icone size={17} />
                </span>
                <span className="flex-1 text-sm font-bold text-gray-700">{s.titre}</span>
                {estOuverte ? <ChevronUp size={17} className="text-gray-400" /> : <ChevronDown size={17} className="text-gray-400" />}
              </button>
              {estOuverte && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <ol className="space-y-2">
                    {s.etapes.map((e, i) => (
                      <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-gray-600">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                          {i + 1}
                        </span>
                        <span>{e}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
                    <BookOpen size={13} className="mr-1 inline" /> {s.astuce}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
