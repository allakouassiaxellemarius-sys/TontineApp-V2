const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' })
global.window = dom.window
global.document = dom.window.document
global.navigator = dom.window.navigator
global.HTMLElement = dom.window.HTMLElement
global.Node = dom.window.Node
const store = {}
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: (k) => { delete store[k] },
}
global.window.localStorage = global.localStorage

const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = require('react')
const { MemoryRouter, Routes, Route } = require('react-router-dom')
const { DataProvider } = require('../src/context/DataContext.jsx')
const { PinProvider } = require('../src/context/PinContext.jsx')
const { ConnectionProvider } = require('../src/context/ConnectionContext.jsx')
const { ToastProvider } = require('../src/context/ToastContext.jsx')
const { AuthContext } = require('../src/context/AuthContext.jsx')
const db = require('../src/lib/db.js')

// Faux fournisseur d'authentification (pas de Firebase en jsdom) :
// valeurs statiques, aucune connexion réseau.
function MockAuthProvider({ children, utilisateur = null }) {
  return React.createElement(
    AuthContext.Provider,
    {
      value: {
        utilisateur,
        pret: true,
        erreur: '',
        connecter: async () => false,
        deconnecter: async () => {},
        connexionEmail: async () => false,
        inscriptionEmail: async () => false,
        resetMotDePasse: async () => false,
      },
    },
    children
  )
}

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err) { this.props.onErr(String((err && err.message) || err)) }
  render() { return this.state.err ? React.createElement('div', null, 'ERROR: ' + this.state.err) : this.props.children }
}

async function main() {
  const g = db.createGroup({ nom: 'Tontine test', montantCotisation: 5000, periodeJours: 7, leReceveurCotonise: true, penalitePctParJour: 1, penalitePlafond: 10, dateDebut: '2026-08-01' })
  const a = db.addMembre(g.id, { nom: 'Aya', telephone: '0701' })
  db.addMembre(g.id, { nom: 'Kofi', telephone: '0702' })
  db.addMembre(g.id, { nom: 'Ama', telephone: '0703' })
  const tours = db.generateTours(g.id)
  db.payerCotisation(g.id, tours[0].id, a.id, 5000, '2026-08-04')
  db.marquerTourRecu(tours[0].id, '2026-08-04')
  db.createPret(g.id, { emprunteurId: a.id, montant: 20000, tauxInteret: 0, dateEcheance: '2026-08-20' })
  const group = db.getGroup(g.id)

  const raw = (k) => JSON.parse(localStorage.getItem('tontine_' + k) || '[]')
  const save = (k, v) => localStorage.setItem('tontine_' + k, JSON.stringify(v))
  const nextRawId = (arr) => arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1
  const invite = (() => {
    const groups = raw('groups')
    const membres = raw('membres')
    const tours = raw('tours')
    const g2 = JSON.parse(JSON.stringify(groups.find((x) => x.id === g.id)))
    g2.id = nextRawId(groups)
    g2.rejoint = true
    groups.push(g2)
    const membreMap = {}
    membres.filter((m) => m.groupeId === g.id).forEach((m) => {
      const n = { ...JSON.parse(JSON.stringify(m)), id: nextRawId(membres), groupeId: g2.id }
      membreMap[m.id] = n.id
      membres.push(n)
    })
    tours.filter((t) => t.groupeId === g.id).forEach((t) => {
      tours.push({ ...JSON.parse(JSON.stringify(t)), id: nextRawId(tours), groupeId: g2.id, membreId: membreMap[t.membreId] ?? null })
    })
    save('groups', groups)
    save('membres', membres)
    save('tours', tours)
    return g2
  })()

  const modules = {
    'OverviewTab': { C: require('../src/screens/tabs/OverviewTab.jsx').default, props: { group } },
    'MembersTab': { C: require('../src/screens/tabs/MembersTab.jsx').default, props: { group } },
    'ToursTab': { C: require('../src/screens/tabs/ToursTab.jsx').default, props: { group } },
    'PaymentsTab': { C: require('../src/screens/tabs/PaymentsTab.jsx').default, props: { group } },
    'PretsTab': { C: require('../src/screens/tabs/PretsTab.jsx').default, props: { group } },
    'HistoryTab': { C: require('../src/screens/tabs/HistoryTab.jsx').default, props: { group } },
    'RemindersTab': { C: require('../src/screens/tabs/RemindersTab.jsx').default, props: { group } },
    'GroupSettingsTab': { C: require('../src/screens/tabs/GroupSettingsTab.jsx').default, props: { group, onUpdate: () => {} } },
    'OverviewTab (invité)': { C: require('../src/screens/tabs/OverviewTab.jsx').default, props: { group: invite, onGoTo: () => {}, readOnly: true } },
    'MembersTab (invité)': { C: require('../src/screens/tabs/MembersTab.jsx').default, props: { group: invite, readOnly: true } },
    'ToursTab (invité)': { C: require('../src/screens/tabs/ToursTab.jsx').default, props: { group: invite, readOnly: true } },
    'GroupSettingsTab (invité)': { C: require('../src/screens/tabs/GroupSettingsTab.jsx').default, props: { group: invite, onUpdate: () => {}, readOnly: true } },
    'DashboardScreen': { C: require('../src/screens/DashboardScreen.jsx').default, router: true, actions: true },
    'GroupScreen': { C: require('../src/screens/GroupScreen.jsx').default, router: true, path: '/groupe/1' },
    'GroupScreen (invité)': { C: require('../src/screens/GroupScreen.jsx').default, router: true, path: '/groupe/2' },
    'SettingsScreen': { C: require('../src/screens/SettingsScreen.jsx').default, router: true },
    'ConnexionScreen': { C: require('../src/screens/ConnexionScreen.jsx').default, router: true, path: '/connexion' },
    'AideScreen': { C: require('../src/screens/AideScreen.jsx').default, router: true },
    'LockScreen': { C: require('../src/screens/LockScreen.jsx').default },
    'AppOpening': { C: require('../src/components/AppOpening.jsx').default },
  }

  let fails = 0
  for (const [name, { C: Comp, props, router, path, actions }] of Object.entries(modules)) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let err = null
    let inner = React.createElement(Comp, props || {})
    if (actions) inner = React.createElement(require('../src/components/GlobalActions.jsx').default, null, inner)
    const wrapped = router
      ? React.createElement(MemoryRouter, { initialEntries: [path || '/'] },
          React.createElement(Routes, null,
            React.createElement(Route, { path: (path || '/').replace(/\/\d+$/, '/:id'), element: inner })))
      : inner
    const wrap = React.createElement(ConnectionProvider, null,
      React.createElement(MockAuthProvider, null,
        React.createElement(DataProvider, null,
          React.createElement(PinProvider, null,
            React.createElement(ToastProvider, null,
              React.createElement(Boundary, { onErr: (m) => { err = m } }, wrapped)
            )
          )
        )
      )
    )
    await act(async () => { createRoot(container).render(wrap) })
    const text = container.textContent || ''
    const hasErr = text.includes('ERROR:')
    console.log((hasErr ? '❌' : '✅') + ' ' + name + (hasErr ? '  → ' + text.slice(0, 200) : '  [' + text.length + ' chars]'))
    if (hasErr || err) fails++
    container.remove()
  }
  // ── Régression : navigation dans les onglets via GroupScreen ──
  const expected = {
    'Aperçu': 'Prochain tour',
    'Membres': 'Aya',
    'Tours': 'En attente',
    'Paiements': 'Tour à régler',
    'Prêts': 'Rembourser',
    'Rappels': 'Tour à rappeler',
    'Historique': 'Solde du groupe',
    'Réglages': 'Partager & inviter',
  }
  {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let err = null
    const inner = React.createElement(require('../src/screens/GroupScreen.jsx').default)
    const wrapped = React.createElement(MemoryRouter, { initialEntries: ['/groupe/1'] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/groupe/:id', element: inner })))
    const wrap = React.createElement(MockAuthProvider, null,
      React.createElement(DataProvider, null,
        React.createElement(PinProvider, null,
          React.createElement(ToastProvider, null,
            React.createElement(Boundary, { onErr: (m) => { err = m } }, wrapped))))
    )
    await act(async () => { createRoot(container).render(wrap) })
    for (const [label, marker] of Object.entries(expected)) {
      // Les onglets du menu « Plus » exigent d'ouvrir la feuille d'abord,
      // dans un act séparé pour laisser React flusher la modale.
      if (['Prêts', 'Rappels', 'Historique', 'Réglages'].includes(label)) {
        await act(async () => {
          const plus = [...container.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Plus')
          if (plus) plus.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
        })
      }
      await act(async () => {
        const btn = [...container.querySelectorAll('button')].find((b) => (b.textContent || '').includes(label))
        if (!btn) throw new Error('Bouton d\u2019onglet manquant : ' + label)
        btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      })
      const ok = !(container.textContent || '').includes('ERROR:') && (container.textContent || '').includes(marker)
      console.log((ok ? '✅' : '❌') + ' GroupScreen onglet "' + label + '" -> "' + marker + '"')
      if (!ok || err) fails++
    }
    container.remove()
  }

  // ── Régression : les onglets de cotisations restent masqués pour l'invité ──
  {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const inner = React.createElement(require('../src/screens/GroupScreen.jsx').default)
    const wrapped = React.createElement(MemoryRouter, { initialEntries: ['/groupe/2'] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/groupe/:id', element: inner })))
    const wrap = React.createElement(DataProvider, null,
      React.createElement(PinProvider, null, wrapped))
    await act(async () => { createRoot(container).render(wrap) })
    const text = container.textContent || ''
    const ok = !text.includes('Paiements') && !text.includes('Rappels') && !text.includes('Historique') && text.includes('lecture seule')
    console.log((ok ? '✅' : '❌') + ' GroupScreen invité : onglets paiements/rappels/historique masqués')
    if (!ok) fails++
    container.remove()
  }

  // ── Roue de tirage au sort ──
  {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let err = null
    const membres = raw('membres').filter((m) => m.groupeId === g.id).map((m) => ({ id: m.id, nom: m.nom }))
    const inner = React.createElement(require('../src/components/WheelSpinner.jsx').default, { membres })
    const wrap = React.createElement(Boundary, { onErr: (m) => { err = m } }, inner)
    await act(async () => { createRoot(container).render(wrap) })
    const text = container.textContent || ''
    const ok = !text.includes('ERROR:') && text.includes('Tourner la roue') && membres.every((m) => text.includes(m.nom))
    console.log((ok ? '✅' : '❌') + ' WheelSpinner : segments des membres + bouton')
    if (!ok || err) fails++
    container.remove()
  }

  // ── Roue masquée avec moins de 2 membres ──
  {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const inner = React.createElement(require('../src/components/WheelSpinner.jsx').default, { membres: [{ id: 1, nom: 'Seul' }] })
    await act(async () => { createRoot(container).render(inner) })
    const ok = (container.textContent || '').trim() === ''
    console.log((ok ? '✅' : '❌') + ' WheelSpinner masqué avec 1 seul membre')
    if (!ok) fails++
    container.remove()
  }

  // ── Classement complet selon l'ordre tiré ──
  {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const membres = raw('membres').filter((m) => m.groupeId === g.id).map((m) => ({ id: m.id, nom: m.nom }))
    const ordre = [membres[2].id, membres[0].id, membres[1].id]
    const inner = React.createElement(require('../src/components/WheelSpinner.jsx').default, { membres, ordre })
    await act(async () => { createRoot(container).render(inner) })
    const text = container.textContent || ''
    const items = [...container.querySelectorAll('ol li')].map((li) => (li.textContent || '').trim())
    const ok =
      items.length === 3 &&
      items[0].includes(membres[2].nom) &&
      items[1].includes(membres[0].nom) &&
      items[2].includes(membres[1].nom) &&
      text.includes('Classement') &&
      text.includes('1er') &&
      text.includes('2e') &&
      text.includes('3e') &&
      text.includes('Passe en premier')
    console.log((ok ? '✅' : '❌') + " WheelSpinner : classement complet selon l'ordre tiré")
    if (!ok) fails++
    container.remove()
  }

  // ── Membre supprimé : retiré de l'ordre tiré et de la roue ──
  {
    const membres = raw('membres').filter((m) => m.groupeId === g.id)
    db.updateGroup(g.id, { ordreTire: membres.map((m) => m.id) })
    const cible = membres[0]
    db.deleteMembre(cible.id)
    const apres = raw('membres').filter((m) => m.groupeId === g.id)
    const ordre = db.getGroup(g.id).ordreTire || []
    const container = document.createElement('div')
    document.body.appendChild(container)
    const inner = React.createElement(require('../src/components/WheelSpinner.jsx').default, { membres: apres, ordre })
    await act(async () => { createRoot(container).render(inner) })
    const text = container.textContent || ''
    const ok = !text.includes(cible.nom) && !ordre.includes(cible.id) && apres.length === membres.length - 1
    console.log((ok ? '✅' : '❌') + ' WheelSpinner : membre supprimé retiré de l ordre tiré')
    if (!ok) fails++
    container.remove()
  }

  // ── Modification de la date d'un tour (persistance + affichage) ──
  {
    const cible = db.getTours(g.id)[0]
    const cibleDate = cible.datePrevue === '2026-09-15' ? '2026-10-01' : '2026-09-15'
    const container = document.createElement('div')
    document.body.appendChild(container)
    const inner = React.createElement(require('../src/screens/GroupScreen.jsx').default)
    const wrapped = React.createElement(MemoryRouter, { initialEntries: ['/groupe/1'] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/groupe/:id', element: inner })))
    const wrap = React.createElement(ConnectionProvider, null,
      React.createElement(MockAuthProvider, { utilisateur: { uid: 'u1' } },
        React.createElement(DataProvider, null,
          React.createElement(PinProvider, null,
            React.createElement(ToastProvider, null, wrapped)))))
    await act(async () => { createRoot(container).render(wrap) })
    await act(async () => {
      const t = [...container.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Tours'))
      if (t) t.click()
    })
    await act(async () => {
      const stylo = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Modifier la date')
      if (stylo) stylo.click()
    })
    const input = container.querySelector('input[type="date"]')
    let saisieOk = false
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
      await act(async () => {
        setter.call(input, cibleDate)
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
      saisieOk = input.value === cibleDate
    }
    await act(async () => {
      const save = [...container.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Enregistrer')
      if (save) save.click()
    })
    const apres = db.getTours(g.id).find((t) => t.id === cible.id)
    const texte = container.textContent || ''
    const affiche = texte.includes('sept. 2026') || texte.includes('oct. 2026')
    const ok = saisieOk && apres && apres.datePrevue === cibleDate && affiche
    console.log((ok ? '✅' : '❌') + ' ToursTab : modification de la date d un tour prise en compte (persistance + affichage)')
    if (!ok) {
      console.log('DEBUG date: saisieOk=' + saisieOk + ' cible=' + cibleDate + ' apres=' + (apres ? apres.datePrevue : 'null') + ' affiche=' + affiche)
      console.log('DEBUG tours actuels:', JSON.stringify(db.getTours(g.id).map((t) => ({ id: t.id, num: t.numero, date: t.datePrevue }))))
    }
    if (!ok) fails++
    container.remove()
  }

  // ── Bandeau hors ligne (affiché uniquement si le mode hors ligne est accepté) ──
  {
    const { ConnectionContext } = require('../src/context/ConnectionContext.jsx')
    const Banner = require('../src/components/HorsLigneBanner.jsx').default
    const cas = [
      { label: 'masqué en ligne', value: { enLigne: true, modeHorsLigne: false }, attendu: '' },
      { label: 'affiché hors connexion acceptée', value: { enLigne: false, modeHorsLigne: true }, attendu: 'Hors ligne' },
      { label: 'masqué si refusé', value: { enLigne: false, modeHorsLigne: false }, attendu: '' },
    ]
    for (const { label, value, attendu } of cas) {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const inner = React.createElement(ConnectionContext.Provider, { value },
        React.createElement(Banner))
      await act(async () => { createRoot(container).render(inner) })
      const text = (container.textContent || '').trim()
      const ok = attendu === '' ? text === '' : text.includes(attendu)
      console.log((ok ? '✅' : '❌') + ' HorsLigneBanner ' + label)
      if (!ok) fails++
      container.remove()
    }
  }

  // ── Modale de demande de mode hors ligne ──
  {
    const { ConnectionContext } = require('../src/context/ConnectionContext.jsx')
    const Modal = require('../src/components/ConnexionModal.jsx').default
    const cas = [
      { label: 'masquée en ligne', value: { enLigne: true, demandeHorsLigne: false }, attendu: '' },
      { label: 'affichée hors connexion (demande)', value: { enLigne: false, demandeHorsLigne: true }, attendu: 'mode hors ligne' },
      { label: 'masquée une fois décidée', value: { enLigne: false, demandeHorsLigne: false }, attendu: '' },
    ]
    for (const { label, value, attendu } of cas) {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const inner = React.createElement(ConnectionContext.Provider, { value },
        React.createElement(Modal))
      await act(async () => { createRoot(container).render(inner) })
      const text = (container.textContent || '').trim()
      const ok = attendu === '' ? text === '' : text.includes(attendu)
      console.log((ok ? '✅' : '❌') + ' ConnexionModal ' + label)
      if (!ok) fails++
      container.remove()
    }
  }

  // ── Tutoriel de démarrage (onboarding façon Duolingo) ──
  {
    const Onboarding = require('../src/components/Onboarding.jsx').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    let fini = false
    await act(async () => { createRoot(container).render(React.createElement(Onboarding, { onFinish: () => { fini = true } })) })
    let text = container.textContent || ''
    let ok = text.includes('Enregistrez chaque cotisation') && text.includes('Continuer') && text.includes('Passer')
    console.log((ok ? '✅' : '❌') + ' Onboarding : première diapo affichée')
    if (!ok) fails++
    const boutonAction = () =>
      [...container.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Continuer') || (b.textContent || '').includes('Commencer'))
    for (let i = 0; i < 5; i++) {
      await act(async () => { const b = boutonAction(); if (b) b.click() })
    }
    text = container.textContent || ''
    ok = text.includes('Un guide complet vous attend') && text.includes('Commencer')
    console.log((ok ? '✅' : '❌') + ' Onboarding : dernière diapo atteinte')
    if (!ok) fails++
    await act(async () => { const b = boutonAction(); if (b) b.click() })
    ok = fini && localStorage.getItem('tontine_tutoriel') === '1'
    console.log((ok ? '✅' : '❌') + ' Onboarding : « Commencer » valide et persiste')
    if (!ok) fails++
    container.remove()
  }

  // ── Carte « Compte Google » dans les paramètres ──
  {
    const SettingsScreen = require('../src/screens/SettingsScreen.jsx').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const wrap = React.createElement(ConnectionProvider, null,
      React.createElement(MockAuthProvider, null,
        React.createElement(DataProvider, null,
          React.createElement(PinProvider, null,
            React.createElement(ToastProvider, null,
              React.createElement(MemoryRouter, { initialEntries: ['/parametres'] },
              React.createElement(Routes, null,
                React.createElement(Route, { path: '/parametres', element: React.createElement(SettingsScreen) }))))
          )
        )
      )
    )
    await act(async () => { createRoot(container).render(wrap) })
    const text = container.textContent || ''
    const ok = text.includes('Compte Google') && text.includes('Se connecter avec Google') && text.includes('Se connecter avec email')
    console.log((ok ? '✅' : '❌') + ' Paramètres : carte Compte Google affichée')
    if (!ok) fails++
    container.remove()
  }

  // ── Écran Connexion (email / mot de passe) ──
  {
    const ConnexionScreen = require('../src/screens/ConnexionScreen.jsx').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const wrap = React.createElement(ConnectionProvider, null,
      React.createElement(MockAuthProvider, null,
        React.createElement(DataProvider, null,
          React.createElement(PinProvider, null,
            React.createElement(ToastProvider, null,
              React.createElement(MemoryRouter, { initialEntries: ['/connexion'] },
              React.createElement(Routes, null,
                React.createElement(Route, { path: '/connexion', element: React.createElement(ConnexionScreen) }))))
          )
        )
      )
    )
    await act(async () => { createRoot(container).render(wrap) })
    let text = container.textContent || ''
    let inputs = [...container.querySelectorAll('input')]
    const emailInput = inputs.find((i) => i.type === 'email')
    const mdpInput = inputs.find((i) => i.type === 'password')
    const seConnecter = [...container.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Se connecter')
    let ok = !!emailInput && !!mdpInput && !!seConnecter && !seConnecter.disabled
    console.log((ok ? '✅' : '❌') + ' ConnexionScreen : formulaire email + mot de passe affiché')
    if (!ok) {
      console.log('DEBUG connexion text:', JSON.stringify(text.slice(0, 300)))
      console.log('DEBUG connexion inputs:', inputs.map((i) => i.type))
    }
    if (!ok) fails++
    await act(async () => {
      const b = [...container.querySelectorAll('button')].find((x) => (x.textContent || '').includes('inscrire'))
      if (b) b.click()
    })
    text = container.textContent || ''
    inputs = [...container.querySelectorAll('input')]
    const mdp2 = inputs.filter((i) => i.type === 'password').length === 2
    const creerCompte = [...container.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Créer le compte'))
    ok = !!creerCompte && mdp2
    console.log((ok ? '✅' : '❌') + " ConnexionScreen : mode « S'inscrire » avec confirmation du mot de passe")
    if (!ok) fails++
    await act(async () => {
      const b = [...container.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Se connecter')
      if (b) b.click()
    })
    await act(async () => {
      const b = [...container.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Mot de passe oublié'))
      if (b) b.click()
    })
    text = container.textContent || ''
    inputs = [...container.querySelectorAll('input')]
    ok = inputs.length === 1 && inputs[0].type === 'email' && text.includes('Envoyer le lien')
    console.log((ok ? '✅' : '❌') + ' ConnexionScreen : mode « Mot de passe oublié » (email seul + envoi)')
    if (!ok) fails++
    container.remove()
  }

  // ── Bouton « Créer une tontine » actif en ligne (régression : enLigne inversé) ──
  {
    const DashboardScreen = require('../src/screens/DashboardScreen.jsx').default
    const GlobalActions = require('../src/components/GlobalActions.jsx').default
    const BottomNav = require('../src/components/BottomNav.jsx').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const wrap = React.createElement(ConnectionProvider, null,
      React.createElement(MockAuthProvider, { utilisateur: { uid: 'u1' } },
        React.createElement(DataProvider, null,
          React.createElement(PinProvider, null,
            React.createElement(ToastProvider, null,
              React.createElement(MemoryRouter, { initialEntries: ['/'] },
              React.createElement(Routes, null,
                React.createElement(Route, { path: '/', element: React.createElement(GlobalActions, null,
                  React.createElement(React.Fragment, null,
                    React.createElement(DashboardScreen),
                    React.createElement(BottomNav))) }))))
          )
        )
      )
    )
    await act(async () => { createRoot(container).render(wrap) })
    await act(async () => {
      const b = [...container.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').includes('Nouvelle tontine'))
      if (b) b.click()
    })
    await act(async () => {
      const b = [...container.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Nouvelle tontine'))
      if (b) b.click()
    })
    const inputs = container.querySelectorAll('input')
    const nomInput = [...inputs].find((i) => i.type !== 'checkbox' && i.type !== 'date' && i.type !== 'number')
    const montantInput = [...inputs].find((i) => i.type === 'number')
    const setNativeValue = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
      setter.call(el, v)
      el.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    }
    await act(async () => {
      if (nomInput) setNativeValue(nomInput, 'Tontine test')
      if (montantInput) setNativeValue(montantInput, '5000')
    })
    const creerBtn = [...container.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Créer')
    const ok = !!creerBtn && !creerBtn.disabled
    if (!ok) {
      console.log('DEBUG creer text:', JSON.stringify((container.textContent || '').slice(0, 300)))
      console.log('DEBUG creer inputs:', [...container.querySelectorAll('input')].map((i) => i.placeholder || i.type))
      console.log('DEBUG creer btns:', [...container.querySelectorAll('button')].map((x) => (x.textContent || '').trim().slice(0, 40)))
    }
    console.log((ok ? '✅' : '❌') + ' Dashboard : bouton « Créer » actif en ligne quand le formulaire est rempli')
    if (!ok) fails++
    container.remove()
  }

  // ── Création bloquée sans compte Google : modal « Connexion requise » ──
  {
    const DashboardScreen = require('../src/screens/DashboardScreen.jsx').default
    const GlobalActions = require('../src/components/GlobalActions.jsx').default
    const BottomNav = require('../src/components/BottomNav.jsx').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const wrap = React.createElement(ConnectionProvider, null,
      React.createElement(MockAuthProvider, null,
        React.createElement(DataProvider, null,
          React.createElement(PinProvider, null,
            React.createElement(ToastProvider, null,
              React.createElement(MemoryRouter, { initialEntries: ['/'] },
              React.createElement(Routes, null,
                React.createElement(Route, { path: '/', element: React.createElement(GlobalActions, null,
                  React.createElement(React.Fragment, null,
                    React.createElement(DashboardScreen),
                    React.createElement(BottomNav))) }))))
          )
        )
      )
    )
    await act(async () => { createRoot(container).render(wrap) })
    await act(async () => {
      const b = [...container.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').includes('Nouvelle tontine'))
      if (b) b.click()
    })
    await act(async () => {
      const b = [...container.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Nouvelle tontine'))
      if (b) b.click()
    })
    const text = container.textContent || ''
    const ok = text.includes('Connexion requise') && text.includes('Se connecter avec Google') && text.includes('Se connecter avec email') && container.querySelectorAll('input').length === 0
    console.log((ok ? '✅' : '❌') + ' Dashboard : création bloquée sans compte Google (modal Connexion requise)')
    if (!ok) fails++
    container.remove()
  }

  // ── Badge « Vous » sur le membre du compte connecté ──
  {
    db.addMembre(g.id, { nom: 'Moi', telephone: '0704', uid: 'u1' })
    const MembersTab = require('../src/screens/tabs/MembersTab.jsx').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const wrap = React.createElement(ConnectionProvider, null,
      React.createElement(MockAuthProvider, { utilisateur: { uid: 'u1' } },
        React.createElement(DataProvider, null,
          React.createElement(PinProvider, null,
            React.createElement(ToastProvider, null,
              React.createElement(MembersTab, { group: db.getGroup(g.id) }))))
      )
    )
    await act(async () => { createRoot(container).render(wrap) })
    const text = container.textContent || ''
    const ok = text.includes('Vous') && !text.includes('ERROR:')
    console.log((ok ? '✅' : '❌') + ' MembersTab : badge « Vous » affiché sur le membre du compte connecté')
    if (!ok) fails++
    container.remove()
  }

  // ── Modal « Rejoindre » : inscription de l'invité (nom + téléphone) ──
  {
    const DashboardScreen = require('../src/screens/DashboardScreen.jsx').default
    const GlobalActions = require('../src/components/GlobalActions.jsx').default
    const BottomNav = require('../src/components/BottomNav.jsx').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const wrap = React.createElement(ConnectionProvider, null,
      React.createElement(MockAuthProvider, null,
        React.createElement(DataProvider, null,
          React.createElement(PinProvider, null,
            React.createElement(ToastProvider, null,
              React.createElement(MemoryRouter, { initialEntries: ['/'] },
              React.createElement(Routes, null,
                React.createElement(Route, { path: '/', element: React.createElement(GlobalActions, null,
                  React.createElement(React.Fragment, null,
                    React.createElement(DashboardScreen),
                    React.createElement(BottomNav))) }))))
          )
        )
      )
    )
    await act(async () => { createRoot(container).render(wrap) })
    await act(async () => {
      const b = [...container.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').includes('Nouvelle tontine'))
      if (b) b.click()
    })
    await act(async () => {
      const b = [...container.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Rejoindre un groupe'))
      if (b) b.click()
    })
    const inputs = [...container.querySelectorAll('input')]
    const codeInput = inputs.find((i) => i.maxLength === 6)
    const nomInput = inputs.find((i) => i.placeholder && i.placeholder.includes('Aya'))
    const telInput = inputs.find((i) => i.type === 'tel')
    const rejoindreBtns = [...container.querySelectorAll('button')].filter((x) => (x.textContent || '').trim() === 'Rejoindre')
    const rejoindreBtn = rejoindreBtns[rejoindreBtns.length - 1]
    const ok = !!codeInput && !!nomInput && !!telInput && !!rejoindreBtn && rejoindreBtn.disabled
    console.log((ok ? '✅' : '❌') + ' Rejoindre : code + nom + téléphone requis avant inscription')
    if (!ok) fails++
    container.remove()
  }

  // ── Carte « Notifications » dans les paramètres ──
  {
    const SettingsScreen = require('../src/screens/SettingsScreen.jsx').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const wrap = React.createElement(ConnectionProvider, null,
      React.createElement(MockAuthProvider, null,
        React.createElement(DataProvider, null,
          React.createElement(PinProvider, null,
            React.createElement(ToastProvider, null,
              React.createElement(MemoryRouter, { initialEntries: ['/parametres'] },
              React.createElement(Routes, null,
                React.createElement(Route, { path: '/parametres', element: React.createElement(SettingsScreen) }))))
          )
        )
      )
    )
    await act(async () => { createRoot(container).render(wrap) })
    const text = container.textContent || ''
    const ok = text.includes('Notifications') && text.includes('Rappels locaux et push serveur') && !text.includes('ERROR:')
    console.log((ok ? '✅' : '❌') + ' Paramètres : carte Notifications affichée')
    if (!ok) {
      console.log('DEBUG notif text:', JSON.stringify(text.slice(0, 400)))
    }
    if (!ok) fails++
    container.remove()
  }

  // ── Rangée « Déverrouillage biométrique » dans la sécurité ──
  {
    const SettingsSecurite = require('../src/components/settings/SettingsSecurite.jsx').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const wrap = React.createElement(ConnectionProvider, null,
      React.createElement(MockAuthProvider, null,
        React.createElement(DataProvider, null,
          React.createElement(PinProvider, null,
            React.createElement(ToastProvider, null,
              React.createElement(SettingsSecurite, { enLigne: true, refresh: () => {} }))))
      )
    )
    await act(async () => { createRoot(container).render(wrap) })
    const text = container.textContent || ''
    const ok = text.includes('Déverrouillage biométrique') && text.includes('Requiert le PIN')
    if (!ok) console.log('DEBUG securite text:', JSON.stringify(text.slice(0, 600)))
    console.log((ok ? '✅' : '❌') + ' Paramètres : rangée « Déverrouillage biométrique » (requiert le PIN)')
    if (!ok) fails++
    container.remove()
  }

  // ── LockScreen : bouton biométrique affiché quand la biométrie est activée ──
  {
    localStorage.setItem('tontine_settings', JSON.stringify({ pinActive: true, biometrieActive: true }))
    const LockScreen = require('../src/screens/LockScreen.jsx').default
    const container = document.createElement('div')
    document.body.appendChild(container)
    const wrap = React.createElement(ConnectionProvider, null,
      React.createElement(MockAuthProvider, null,
        React.createElement(DataProvider, null,
          React.createElement(PinProvider, null,
            React.createElement(ToastProvider, null,
              React.createElement(LockScreen))))
      )
    )
    await act(async () => { createRoot(container).render(wrap) })
    const text = container.textContent || ''
    const btn = [...container.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Déverrouiller avec'))
    const ok = !!btn && text.includes('Entrez votre code PIN')
    console.log((ok ? '✅' : '❌') + ' LockScreen : bouton « Déverrouiller avec l\u2019empreinte » affiché')
    if (!ok) {
      console.log('DEBUG lock bio text:', JSON.stringify(text.slice(0, 250)))
    }
    if (!ok) fails++
    localStorage.setItem('tontine_settings', JSON.stringify({}))
    container.remove()
  }

  // ── Détection des mises à jour : le bundle embarqué (APK) prime ──
  {
    const { versionBundleActuelle, comparerVersions } = require('../src/lib/miseAJour.js')
    localStorage.removeItem('tontine_bundle_version')
    const builtin = versionBundleActuelle()
    const ok1 = comparerVersions(builtin, '1.17.0') >= 0
    localStorage.setItem('tontine_bundle_version', '1.16.0')
    const ok2 = versionBundleActuelle() === builtin
    localStorage.setItem('tontine_bundle_version', '99.0.0')
    const ok3 = versionBundleActuelle() === '99.0.0'
    localStorage.removeItem('tontine_bundle_version')
    const ok = ok1 && ok2 && ok3
    console.log((ok ? '✅' : '❌') + ' Mise à jour : le bundle embarqué prime sur la version OTA stockée')
    if (!ok) console.log('DEBUG maj:', JSON.stringify({ builtin, ok1, ok2, ok3 }))
    if (!ok) fails++
  }

  // ── Export Excel réel (.xlsx) par groupe et global ──
  {
    const XLSX = require('xlsx')
    const { construireClasseurGroupe, exporterGroupeExcel } = require('../src/lib/excel.js')
    const { construireClasseurGlobal, exporterToutesTontinesExcel } = require('../src/lib/excel.js')
    let ok = true
    try {
      const wb = construireClasseurGroupe(g.id)
      const noms = wb.SheetNames
      const att = ['Synthèse', 'Membres', 'Tours', 'Paiements', 'Historique', 'Prêts']
      if (att.some((n) => !noms.includes(n))) throw new Error('feuilles manquantes: ' + noms.join(','))
      const membres = XLSX.utils.sheet_to_json(wb.Sheets['Membres'])
      if (!membres.length || !membres[0]['Membre']) throw new Error('feuille Membres vide')
    } catch (e) { ok = false; console.log('DEBUG excel groupe err:', String(e)) }
    try {
      const wb = construireClasseurGlobal()
      if (!wb.SheetNames.includes('Toutes les tontines') || !wb.SheetNames.includes('Tontine test')) throw new Error('feuilles globales manquantes')
    } catch (e) { ok = false; console.log('DEBUG excel global err:', String(e)) }
    try {
      await exporterGroupeExcel(g.id)
    } catch (e) { ok = false; console.log('DEBUG excel save groupe err:', String(e)) }
    try {
      await exporterToutesTontinesExcel()
    } catch (e) { ok = false; console.log('DEBUG excel save global err:', String(e)) }
    console.log((ok ? '✅' : '❌') + ' Excel : classeur .xlsx par groupe et global générés')
    if (!ok) fails++
  }

  // ── Sauvegarde JSON : les prêts sont inclus ──
  {
    const { construireSauvegarde } = require('../src/lib/sauvegarde.js')
    const { createPret } = require('../src/lib/db.js')
    const nbAvant = construireSauvegarde().data.prets.length
    createPret(g.id, { emprunteurId: a, montant: 10000, tauxInteret: 0, dateEcheance: '2026-09-01' })
    const apres = construireSauvegarde().data.prets
    const ok = apres.length === nbAvant + 1 && apres.some((p) => p.groupeId === g.id && p.montant === 10000)
    console.log((ok ? '✅' : '❌') + ' Sauvegarde JSON : les prêts sont inclus')
    if (!ok) fails++
  }

  // ── i18n : réglage de langue FR/EN ──
  {
    const { t, getLangue, setLangue } = require('../src/lib/i18n.js')
    setLangue('fr')
    const frOk =
      getLangue() === 'fr' &&
      t('nav.accueil') === 'Accueil' &&
      t('settings.titre') === 'Paramètres' &&
      t('dash.nMembres', { n: 2 }) === '2 membre(s)' &&
      t('lock.deverrouillerAvec', { type: 'l\'empreinte' }) === 'Déverrouiller avec l\'empreinte'
    setLangue('en')
    const enOk =
      getLangue() === 'en' &&
      t('nav.accueil') === 'Home' &&
      t('settings.titre') === 'Settings' &&
      t('dash.nMembres', { n: 2 }) === '2 member(s)' &&
      t('lock.deverrouillerAvec', { type: 'your fingerprint' }) === 'Unlock with your fingerprint'
    setLangue('fr')
    const ok = frOk && enOk
    console.log((ok ? '✅' : '❌') + ' Langue : réglage FR/EN + traduction et interpolation')
    if (!ok) console.log('DEBUG langue:', JSON.stringify({ frOk, enOk, fr: t('nav.accueil') }))
    if (!ok) fails++
  }

  console.log(fails === 0 ? '\nTous les écrans et onglets se montent sans erreur ✅' : `\n${fails} composant(s) en erreur ❌`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })


