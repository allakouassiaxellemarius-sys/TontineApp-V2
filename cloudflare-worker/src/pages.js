// Pages publiques de conformité : politique de confidentialité et demande de
// suppression de données. Servies en HTML sans jeton, car les stores (APKPure,
// Google Play) exigent une URL accessible publiquement.

const STYLE = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin:0; padding:32px 16px 72px; font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  background:#f7f7f8; color:#1c1c1e; }
main { max-width:760px; margin:0 auto; background:#fff; border-radius:16px; padding:28px 30px;
  box-shadow:0 1px 3px rgba(0,0,0,.08); }
h1 { font-size:1.7rem; margin:0 0 6px; }
h2 { font-size:1.15rem; margin:32px 0 8px; }
h3 { font-size:1rem; margin:22px 0 6px; }
p.meta { color:#6b6b70; margin:0 0 24px; font-size:.92rem; }
a { color:#1a6dff; }
ul { padding-left:22px; }
.form { display:grid; gap:12px; margin-top:18px; }
label { font-size:.9rem; font-weight:600; }
input,textarea { width:100%; padding:11px 12px; border:1px solid #d5d5da; border-radius:10px;
  font:inherit; background:#fff; color:inherit; }
button { justify-self:start; padding:12px 22px; border:0; border-radius:10px; background:#1a6dff;
  color:#fff; font:inherit; font-weight:600; cursor:pointer; }
.note { background:#eef4ff; border-left:4px solid #1a6dff; padding:12px 14px; border-radius:8px; font-size:.94rem; }
.ok { color:#0a7a3c; font-weight:600; }
.erreur { color:#b3261e; font-weight:600; }
@media (prefers-color-scheme: dark) {
  body { background:#121214; color:#e8e8ea; }
  main { background:#1d1d20; box-shadow:none; }
  input,textarea { background:#26262a; border-color:#3a3a40; color:#e8e8ea; }
  .note { background:#1b2434; }
}
`

function page(titre, corps) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titre}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${corps}
</main>
</body>
</html>`
}

const EMAIL = 'tontine.manager.app@gmail.com'

export function privacyHtml() {
  const corps = `
<h1>Politique de confidentialité — Tontine Manager</h1>
<p class="meta">Dernière mise à jour : 1<sup>er</sup> octobre 2026 (révision 2) — version 2.3.0</p>

<h2>1. Qui sommes-nous ?</h2>
<p><strong>Tontine Manager</strong> (« l'Application ») est éditée par un développeur
indépendant, publiée sous le compte développeur <em>Tontine Manager</em> sur APKPure.</p>
<p>Contact : <a href="mailto:${EMAIL}">${EMAIL}</a><br>
Adresse postale : communiquée sur simple demande par email.<br>
Responsable du traitement : l'éditeur de l'Application.</p>

<h2>2. Données collectées</h2>

<h3>2.1 Compte utilisateur</h3>
<p>L'authentification est fournie par <strong>Firebase Authentication (Google LLC)</strong> :
connexion avec un compte Google, ou avec une adresse email et un mot de passe. Nous
conservons l'identifiant technique du compte (<code>uid</code>), l'adresse email de
connexion, ainsi que le nom d'affichage et la photo de profil fournis par Google.</p>
<p>Le mot de passe n'est <strong>jamais</strong> stocké par l'Application ni par ses serveurs.</p>
<p>Vous pouvez aussi utiliser l'Application <strong>sans compte</strong> : toute la gestion
reste disponible en local ; seuls la synchronisation et les rappels nécessitent un compte.</p>

<h3>2.2 Données de gestion de tontines</h3>
<p>Vous saisissez librement : groupes, membres (noms, numéros de téléphone), tours de
cotisation, montants, pénalités, prêts, historique de paiements, messages de discussion et
photos partagées, objectifs d'épargne.</p>
<ul>
<li><strong>Par défaut, ces données restent UNIQUEMENT sur votre appareil</strong> ; rien
n'est transmis tant que vous n'activez pas la synchronisation (ci-dessous) ou les rappels
WhatsApp par le serveur (§ 2.5).</li>
<li>Si vous <strong>activez la synchronisation</strong> d'une tontine (facultatif), une copie
est publiée sur <strong>Cloudflare Workers (D1 / Key-Value)</strong>. Elle devient accessible
aux personnes qui connaissent le <strong>code d'invitation</strong> que vous partagez : les
membres invités peuvent la consulter et y participer (messages, inscriptions, signalements
de paiement).</li>
<li><strong>Photos de la discussion</strong> : compressées sur votre appareil, puis stockées
en base, lisibles uniquement par les participants du groupe.</li>
<li><strong>Accusés de lecture</strong> : un pointeur technique <code>{ uid, nom, dernier
message lu, date }</code> est conservé pour afficher « vu par ».</li>
</ul>

<h3>2.3 Notifications</h3>
<p>Si vous activez les notifications, un <strong>jeton technique (Firebase Cloud
Messaging)</strong> est associé à votre compte, utilisé uniquement pour les rappels de
cotisation et les nouveaux messages.</p>

<h3>2.4 Paiement de la cotisation</h3>
<p>L'argent ne transite jamais par l'Application. Le responsable publie son <strong>alias
Pi-Spi</strong> (l'identifiant à 36 caractères que les membres recopient dans l'application
Pi-Spi) ; le membre
envoie sa cotisation directement à cet alias, puis signale « J'ai payé ». Les références de
transaction nécessaires au rapprochement (montant, référence, opérateur, tour concerné) sont
stockées sur nos serveurs tant que le groupe est synchronisé. Les coordonnées bancaires et les
codes PIN Mobile Money ne sont jamais saisis ni conservés.</p>

<h3>2.5 Rappels WhatsApp envoyés par le serveur (facultatif)</h3>
<p>Dans une tontine synchronisée, le responsable peut activer l'envoi automatique des rappels
de cotisation via <strong>WhatsApp Business (Meta Platforms)</strong> : le message part du
numéro professionnel de la tontine, sans passer par le téléphone du responsable. Sont alors
transmis à Meta, pour ce seul envoi : les <strong>numéros de téléphone des membres à
relancer</strong>, leur nom, ainsi que le contenu type du rappel (nom du groupe, montant,
échéance). L'envoi est déclenché par le responsable (ou un co-gérant), après confirmation
dans l'Application, et une réponse « STOP » d'un membre supprime ce numéro de toute relance
future. Les rappels envoyés depuis le téléphone du responsable (WhatsApp ou application SMS)
ne passent pas par nos serveurs.</p>

<h3>2.6 Assistant IA (facultatif)</h3>
<p>L'assistant répond à partir des données de <strong>votre</strong> tontine : un résumé
structurel (nom du groupe, membres, montants, statut des paiements) est transmis au service
d'IA pour calculer la réponse. Les adresses email et les numéros de téléphone des membres
sont retirés du contexte envoyé ; seul le numéro du responsable est conservé, afin que
l'assistant puisse rédiger les instructions de paiement. L'éditeur de l'IA traite ces
informations pour le seul calcul de la réponse, sans profilage publicitaire.</p>

<h3>2.7 Données de fonctionnement</h3>
<p>L'Application ne contient <strong>aucune publicité, aucun traceur publicitaire, aucun outil
d'analyse comportementale de tiers</strong>. Elle ne collecte <strong>aucune donnée de
localisation</strong>.</p>

<h2>3. Destinataires des données</h2>
<ul>
<li>Vous-même et, pour les tontines synchronisées, <strong>les membres que vous invitez</strong>.</li>
<li><strong>Google LLC</strong> — Firebase Authentication et Firebase Cloud Messaging.</li>
<li><strong>Cloudflare, Inc.</strong> — workers, base D1 et Key-Value (synchronisation,
photos, accusés de lecture, notifications, mises à jour).</li>
<li><strong>Pi-Spi</strong> — le membre y saisit l'alias du responsable pour payer :
aucune donnée du dossier de la tontine ne lui est transmise.</li>
<li><strong>Meta Platforms (WhatsApp Business)</strong> — uniquement si le responsable active
les rappels par le serveur : numéros des membres relancés, leur nom, ainsi que le montant et
l'échéance du rappel, pour ce seul envoi.</li>
<li><strong>Resend</strong> — email de réinitialisation du mot de passe.</li>
<li><strong>GitHub</strong> — manifeste et paquet des mises à jour ; le moteur de mise à
jour s'exécute localement, sans télémétrie.</li>
</ul>
<p>Ces intervenants agissent en qualité de sous-traitants techniques. Vos données ne sont
<strong>ni vendues, ni louées, ni transmises à des tiers publicitaires</strong>.</p>

<h2>4. Durée de conservation</h2>
<ul>
<li><strong>Données locales</strong> : sur votre appareil, jusqu'à leur suppression dans
l'Application ou la désinstallation.</li>
<li><strong>Données synchronisées</strong> : tant que la synchronisation du groupe est active.
Désactiver la synchronisation ou supprimer le groupe supprime sa copie cloud (messages,
photos, accusés de lecture, signalements de paiement).</li>
<li><strong>Compte et jeton de notification</strong> : jusqu'à la suppression du compte.</li>
</ul>

<h2>5. Vos droits</h2>
<h3>5.1 Accès, rectification, portabilité</h3>
<p>Exportez vos tontines en <strong>PDF, Excel et JSON</strong> (Statistiques &amp; historique →
Export). La rectification se fait directement dans l'Application.</p>
<h3>5.2 Effacement — suppression du compte</h3>
<ol>
<li><strong>Dans l'Application</strong> : Profil → Sécurité → <em>Supprimer mon compte</em>.
Cette action supprime immédiatement votre compte, vos groupes synchronisés, leurs messages,
photos, accusés de lecture et jetons de notification côté serveur.</li>
<li><strong>Par cette page</strong> ou par email à <a href="mailto:${EMAIL}">${EMAIL}</a> :
formulaire ci-dessous, ou message envoyé depuis l'adresse liée à votre compte. Demande
traitée sous 30 jours.</li>
</ol>
<h3>5.3 Opposition, retrait du consentement, réclamation</h3>
<p>Vous pouvez à tout moment désactiver les notifications, la synchronisation d'un groupe ou
l'assistant IA, sans effet sur le reste de l'Application. Vous pouvez introduire une
réclamation auprès de l'autorité de contrôle compétente de votre pays (par exemple la ARTDP,
en Côte d'Ivoire).</p>

<h2>6. Sécurité</h2>
<ul>
<li>Communications avec les serveurs <strong>chiffrées en HTTPS</strong> ; trafic en clair
désactivé dans l'Application.</li>
<li>Accès aux données synchronisées <strong>restreint aux utilisateurs authentifiés</strong> ;
écriture réservée au responsable du groupe et à ses co-gérants.</li>
<li>Photos et accusés de lecture consultables uniquement par les participants du groupe.</li>
<li>Session conservée dans un stockage <strong>chiffré</strong> de l'appareil (AES-GCM, clé
non extractible) ; ouverture protégée par code PIN ou biométrie, exigée pour toute action
financière (distribution du pot, changement du compte de collecte, suppression d'un groupe).</li>
<li><strong>Limite assumée</strong> : les tontines non synchronisées sont dans le stockage
local d'Android, protégé par le système mais non chiffré par l'Application. Ne confiez pas
votre appareil et supprimez vos groupes avant de le céder.</li>
</ul>
<p>Aucune mesure n'est infaillible : ne partagez ni votre code d'invitation, ni votre code
PIN, ni votre mot de passe.</p>

<h2>7. Mineurs</h2>
<p>L'Application est destinée aux personnes majeures capables de gérer une activité
financière de groupe. Nous ne collectons pas volontairement de données d'enfants.</p>

<h2>8. Transferts hors Union européenne</h2>
<p>Les données synchronisées sont hébergées par Cloudflare et Google, et les rappels envoyés
par le serveur transitent par Meta Platforms (WhatsApp) ; les serveurs de ces prestataires
peuvent être situés hors de l'UE. L'éditeur s'appuie sur les clauses contractuelles types de
ces hébergeurs pour ces transferts.</p>

<h2>9. Modifications</h2>
<p>La présente politique peut être mise à jour ; la date en tête indique la dernière
révision. Les utilisateurs en sont informés dans l'Application lors d'une mise à jour
notable. La version la plus récente est toujours consultable à cette adresse.</p>

<h2>10. Contact</h2>
<p>Pour toute question ou pour exercer vos droits : <a href="mailto:${EMAIL}">${EMAIL}</a>.
Demande de suppression : <a href="/suppression">/suppression</a>.</p>
`
  return page('Politique de confidentialité — Tontine Manager', corps)
}

export function suppressionHtml() {
  const corps = `
<h1>Suppression de données — Tontine Manager</h1>
<p class="meta">RGPD article 17 · « droit à l'effacement »</p>

<p>Vos données sont pour l'essentiel sur votre appareil. Pour supprimer ce qui est côté
serveur (compte, groupes synchronisés, messages, photos, accusés de lecture, jetons de
notification), deux voies :</p>
<ul>
<li><strong>Immédiate</strong> : dans l'Application, <em>Profil → Sécurité → Supprimer mon
compte</em>. La suppression est instantanée et irréversible.</li>
<li><strong>Par demande</strong> : le formulaire ci-dessous, ou un email à
<a href="mailto:${EMAIL}">${EMAIL}</a> envoyé depuis l'adresse liée à votre compte.
Traitement sous 30 jours.</li>
</ul>

<form class="form" id="f" method="post" action="/suppression">
<div>
  <label for="email">Adresse email du compte</label>
  <input id="email" name="email" type="email" required autocomplete="email"
    placeholder="vous@exemple.com">
</div>
<div>
  <label for="uid">Identifiant du compte (facultatif)</label>
  <input id="uid" name="uid" type="text" autocomplete="off" placeholder="visible dans Profil → Sécurité">
</div>
<div>
  <label for="message">Précisions (facultatif)</label>
  <textarea id="message" name="message" rows="4" placeholder="Compte email oublié, tontine concernée…"></textarea>
</div>
<button type="submit">Envoyer la demande</button>
<p id="etat" role="status"></p>
</form>

<p class="note">Ce formulaire transmet uniquement l'adresse email, l'identifiant éventuel et
vos précisions à l'éditeur de l'Application, dans le seul but de traiter votre demande.
Aucune donnée de tontine n'est lue ici.</p>

<p><a href="/privacy">← Politique de confidentialité complète</a></p>

<script>
(function () {
  var f = document.getElementById('f'), etat = document.getElementById('etat');
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    etat.className = ''; etat.textContent = 'Envoi en cours…';
    var payload = {
      email: document.getElementById('email').value.trim(),
      uid: document.getElementById('uid').value.trim(),
      message: document.getElementById('message').value.trim()
    };
    try {
      var res = await fetch('/suppression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var j = await res.json().catch(function () { return {}; });
      if (res.ok && j.ok) {
        etat.className = 'ok';
        etat.textContent = 'Demande enregistrée. L’éditeur y répond sous 30 jours.';
        f.reset();
      } else {
        etat.className = 'erreur';
        etat.textContent = j.error || 'Envoi impossible. Réessayez ou écrivez par email.';
      }
    } catch (err) {
      etat.className = 'erreur';
      etat.textContent = 'Réseau indisponible. Réessayez ou écrivez par email.';
    }
  });
})();
</script>
`
  return page('Suppression de données — Tontine Manager', corps)
}

export function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
