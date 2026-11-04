/**
 * Maquettes mobile-first de Tontine Manager, générées dans Figma.
 *
 * Tout le contenu (libellés, ordre des sections, états vides) est recopié du
 * code source de l'app ; les couleurs sont les jetons mesurés dans
 * `src/index.css`, `src/lib/theme.js` et `src/screens/DashboardScreen.jsx`.
 * Aucune valeur n'est inventée : l'argent, les noms et les statuts viennent du
 * jeu de démonstration `src/lib/demo.js` (5 membres, 5 000 FCFA, 7 jours, 2 %/j).
 */

'use strict'

const LARGEUR = 360
const HAUTEUR = 800
const BARRE = 28
const NAV = 68
const MARGE = 16
const INTERNE = LARGEUR - 2 * MARGE
const RAYON_PILL = 999

const C = {
  page: '#F7F9FB',
  carte: '#FFFFFF',
  bord: '#DFE6EC',
  bordDoux: '#EEF2F6',
  texte: '#0F1519',
  texteDim: '#33414D',
  texteDoux: '#5F6E7A',

  brand50: '#F0F7FD',
  brand100: '#DCEBF9',
  brand200: '#ACD4F5',
  brand300: '#7CBDF0',
  brand500: '#1B87DA',
  brand600: '#0D6EB8',
  brand700: '#0A5790',
  brand800: '#08416C',
  brand900: '#062B4A',
  enteteBas: '#0A5A98',

  success100: '#D1FAE5',
  success500: '#10B981',
  success600: '#059669',
  success700: '#047857',
  danger50: '#FFF1F2',
  danger500: '#F43F5E',
  danger700: '#BE123C',
  warning50: '#FFFBEB',
  warning500: '#F59E0B',
  warning700: '#B45309',
  error: '#C62828',

  ocre: '#D98324',
  ocreFonce: '#C06E12',
  ocreTexte: '#0F2A44',
  wave: '#1B7A44',
  orange: '#F47B20',

  blanc: '#FFFFFF',
  noir: '#000000',
}

// Pastilles recopiées de l'accueil (« accueil-ameliore.html »).
const PILL = {
  ok: { fond: '#E6F4ED', texte: '#047857' },
  attente: { fond: '#FDF1E3', texte: '#9C620F' },
  retard: { fond: '#FDEDE2', texte: '#C2410C' },
}
const TEINTE = { bar: '#0D6EB8', ava: ['#0D6EB8', '#0A5A98'] }
// Ombre `.card` littérale (src/index.css:249) : 0 1px 3px rgba(15,23,42,.08),
// 0 8px 24px rgba(15,23,42,.06) — rgb(15,23,42) = 0.059 / 0.09 / 0.165.
const OMBRE = [
  { type: 'DROP_SHADOW', color: { r: 0.059, g: 0.09, b: 0.165, a: 0.08 }, offset: { x: 0, y: 1 }, radius: 3, spread: 0, visible: true },
  { type: 'DROP_SHADOW', color: { r: 0.059, g: 0.09, b: 0.165, a: 0.06 }, offset: { x: 0, y: 8 }, radius: 24, spread: 0, visible: true },
]

// Jeu de démonstration réel : « 🌟 Tontine Démo (Nzassa) », 5 000 FCFA / 7 j.
const GROUPE = '🌟 Tontine Démo (Nzassa)'
const COTISATION = '5 000 FCFA'
const POT = '25 000 FCFA'
const NOMS = ['Aya Kouassi', 'Konan Yao', 'Fatou Traoré', 'Ibrahim Bakayoko', "Adjoua N'Guessan"]
const DEVISE = 'FCFA'

/* ─────────────────────────────── polices ─────────────────────────────── */

const FAMILLE = 'Inter'
const GRAISSES = ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']
const dispo = {}

async function chargerPolices() {
  for (const g of GRAISSES) {
    try {
      await figma.loadFontAsync({ family: FAMILLE, style: g })
      dispo[g] = g
    } catch (e) {
      const deRechange = g === 'Regular' ? 'Regular' : 'Bold'
      await figma.loadFontAsync({ family: FAMILLE, style: deRechange })
      dispo[g] = deRechange
    }
  }
}

function graisse(nom) {
  return dispo[nom] || dispo.Regular || 'Regular'
}

/* ────────────────────────────── primitives ───────────────────────────── */

function rgb(hex) {
  const h = String(hex).replace('#', '')
  const n = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h
  return {
    r: parseInt(n.slice(0, 2), 16) / 255,
    g: parseInt(n.slice(2, 4), 16) / 255,
    b: parseInt(n.slice(4, 6), 16) / 255,
  }
}

function solide(coul, opacite) {
  return { type: 'SOLID', color: rgb(coul), opacity: opacite == null ? 1 : opacite }
}

function degrade(haut, bas) {
  return {
    type: 'GRADIENT_LINEAR',
    gradientTransform: [[0, 1, 0], [1, 0, 0]],
    gradientStops: [
      { position: 0, color: rgb(haut) },
      { position: 1, color: rgb(bas) },
    ],
  }
}

// Boîte : dir 'P' (pile) | 'R' (rangée) | 'N' (aucun layout).
// Une dimension absente devient « hug », une dimension donnée est fixée.
function boite(nom, o) {
  o = o || {}
  const f = figma.createFrame()
  f.name = nom
  f.resize(o.l == null ? 10 : o.l, o.h == null ? 10 : o.h)
  if (o.dir === 'N') {
    f.layoutMode = 'NONE'
  } else {
    f.layoutMode = o.dir === 'R' ? 'HORIZONTAL' : 'VERTICAL'
    const largeurFixe = o.l != null
    const hauteurFixe = o.h != null
    if (o.dir === 'R') {
      f.primaryAxisSizingMode = largeurFixe ? 'FIXED' : 'AUTO'
      f.counterAxisSizingMode = hauteurFixe ? 'FIXED' : 'AUTO'
    } else {
      f.primaryAxisSizingMode = hauteurFixe ? 'FIXED' : 'AUTO'
      f.counterAxisSizingMode = largeurFixe ? 'FIXED' : 'AUTO'
    }
    f.itemSpacing = o.gap || 0
    if (o.gap2 != null) f.counterAxisSpacing = o.gap2 || 0
    f.primaryAxisAlignItems = o.align || 'MIN'
    f.counterAxisAlignItems = o.valign || (o.dir === 'R' ? 'CENTER' : 'MIN')
  }
  const p = o.pad || [0, 0, 0, 0]
  f.paddingTop = p[0]
  f.paddingRight = p[1]
  f.paddingBottom = p[2]
  f.paddingLeft = p[3]
  f.fills = o.degrade ? [degrade(o.degrade[0], o.degrade[1])] : (o.fond ? [solide(o.fond, o.alpha)] : [])
  if (o.rayon != null) f.cornerRadius = o.rayon
  if (o.rayons) f.rectangleCornerRadii = o.rayons
  if (o.bord) {
    f.strokes = [solide(o.bord, o.alphaBord)]
    f.strokeWeight = o.trait || 1
    f.strokeAlign = 'INSIDE'
  }
  f.effects = o.ombre ? OMBRE : []
  f.clipsContent = o.clip === true
  return f
}

function pile(nom, o) {
  return boite(nom, Object.assign({ dir: 'P' }, o))
}

function rangee(nom, o) {
  return boite(nom, Object.assign({ dir: 'R' }, o))
}

function texte(contenu, o) {
  o = o || {}
  const t = figma.createText()
  t.fontName = { family: FAMILLE, style: graisse(o.gr) }
  t.characters = String(contenu)
  t.fontSize = o.ta || 14
  t.fills = [solide(o.c || C.texte, o.alpha)]
  t.letterSpacing = { value: o.ls == null ? (o.ta >= 24 ? -0.5 : 0) : o.ls, unit: 'PIXELS' }
  if (o.l) {
    if (o.lignes) {
      const pas = Math.round((o.ta || 14) * 1.4)
      t.lineHeight = { value: pas, unit: 'PIXELS' }
      t.textAutoResize = 'NONE'
      t.resize(o.l, o.lignes * pas)
    } else {
      t.textAutoResize = 'HEIGHT'
      t.resize(o.l, t.height)
    }
  }
  if (o.milieu) t.textAlignHorizontal = 'CENTER'
  if (o.droite) t.textAlignHorizontal = 'RIGHT'
  t.name = '‹' + String(contenu).slice(0, 28) + '›'
  return t
}

function figure(forme, taille, coul, o) {
  o = o || {}
  const n = forme === 'cercle' || forme === 'anneau' ? figma.createEllipse() : figma.createRectangle()
  n.name = 'icône · ' + forme
  n.resize(taille, o.ep == null ? taille : o.ep)
  if (forme === 'anneau') {
    n.fills = []
    n.strokes = [solide(coul)]
    n.strokeWeight = o.trait || 2
  } else {
    n.fills = [solide(coul, o.alpha)]
  }
  if (o.rayon != null) n.cornerRadius = o.rayon
  if (forme === 'losange') n.rotation = 45
  return n
}

function plusIcone(taille, coul) {
  const f = boite('icône · plus', { dir: 'N', l: taille, h: taille })
  const b1 = figure('barre', taille, coul, { ep: Math.max(2, taille / 6), rayon: taille / 12 })
  b1.x = 0
  b1.y = taille / 2 - b1.height / 2
  const b2 = figure('barre', taille, coul, { ep: Math.max(2, taille / 6), rayon: taille / 12 })
  b2.resize(taille / 6, taille)
  b2.x = taille / 2 - b2.width / 2
  b2.y = 0
  f.appendChild(b1)
  f.appendChild(b2)
  return f
}

function fleche(taille, coul, vers) {
  const f = boite('icône · chevron', { dir: 'N', l: taille, h: taille })
  const t = texte(vers === 'droite' ? '›' : '‹', { ta: taille, gr: 'Bold', c: coul })
  t.x = 0
  t.y = taille / 2 - t.height / 2
  f.appendChild(t)
  f.resize(taille, taille)
  return f
}

// Pastille de statut = `rounded-full px-2 py-0.5 text-[11px] font-bold`
// (DashboardScreen.jsx:452, EpargneScreen.jsx:315).
function pastille(libelle, p, o) {
  o = o || {}
  const r = rangee('Pastille ' + libelle, {
    h: o.h, rayon: RAYON_PILL, fond: p.fond, gap: 4, pad: [2, 8, 2, 8], valign: 'CENTER',
  })
  r.appendChild(texte(libelle, { ta: o.ta || 11, gr: 'Bold', c: p.texte }))
  return r
}

// Bouton : 48 px partout (jeton --tactile-min). Primaire = plat, jamais de
// dégradé (design system §7), pour tenir AA sur le blanc.
function bouton(libelle, o) {
  o = o || {}
  const pleine = o.pleine === true
  const b = rangee('Bouton · ' + libelle, {
    l: pleine ? INTERNE : undefined,
    h: o.h || 48,
    rayon: 14,
    gap: 8,
    pad: [0, 16, 0, 16],
    align: 'CENTER',
    fond: o.fond || (o.secondaire ? C.brand50 : undefined),
    bord: o.secondaire ? C.brand200 : undefined,
    alpha: o.alpha,
  })
  b.appendChild(texte(libelle, {
    ta: o.ta || 14,
    gr: 'SemiBold',
    c: o.c || (o.secondaire ? C.brand800 : o.fond ? C.blanc : C.brand700),
  }))
  if (o.icone) b.insertChild(0, o.icone)
  return b
}

// Carte = `.card` (src/index.css:244-249) : rayon 24, bord 1 px --border-subtle,
// padding 16 mais 12 au-dessous du breakpoint 360 px (index.css:878) — les
// cadres font 360 px, c'est donc la variante serrée qui s'affiche sur le tel.
function carte(nom, o) {
  o = o || {}
  return pile(nom, {
    l: INTERNE, gap: o.gap == null ? 12 : o.gap, pad: o.pad || [12, 12, 12, 12],
    fond: o.fond || C.carte, rayon: o.rayon == null ? 24 : o.rayon, ombre: o.ombre !== false,
    bord: o.bord || C.bordDoux, valign: 'MIN',
  })
}

function jauge(pct, o) {
  o = o || {}
  const larg = o.l || INTERNE - 24
  // `h-2` = 8 px (EpargneScreen.jsx:324) ; les jauges « hero » passent h: 10 (`h-2.5`).
  const ep = o.h == null ? 8 : o.h
  const f = boite('Jauge ' + pct + ' %', { dir: 'N', l: larg, h: ep })
  f.cornerRadius = ep / 2
  const fond = figure('barre', larg, o.fond || C.bordDoux, { ep })
  fond.cornerRadius = ep / 2
  fond.x = 0
  fond.y = 0
  const remplie = figure('barre', Math.max(ep, larg * Math.min(1, pct / 100)), o.c || C.brand600, { ep })
  remplie.cornerRadius = ep / 2
  remplie.x = 0
  remplie.y = 0
  f.appendChild(fond)
  f.appendChild(remplie)
  return f
}

function avatar(initiales, taille, o) {
  o = o || {}
  const a = boite('Avatar ' + initiales, { dir: 'N', l: taille, h: taille })
  // Cercle sauf tuile de liste : `rounded-[13px]` sur 46 px (DashboardScreen.jsx:443).
  a.cornerRadius = o.rayon == null ? taille / 2 : o.rayon
  a.fills = o.degrade ? [degrade(o.degrade[0], o.degrade[1])] : [solide(o.fond || C.brand100)]
  const t = texte(initiales, { ta: Math.max(10, Math.round(taille * 0.34)), gr: 'Bold', c: o.c || C.blanc })
  t.x = (taille - t.width) / 2
  t.y = (taille - t.height) / 2
  a.appendChild(t)
  return a
}

function ligneInfoSimple(libelle) {
  const r = rangee('Entrée · ' + libelle, {
    l: INTERNE, h: 48, gap: 10, align: 'SPACE_BETWEEN', pad: [0, 4, 0, 4],
  })
  r.appendChild(texte(libelle, { ta: 14, c: C.texteDim }))
  r.appendChild(fleche(14, C.texteDoux, 'droite'))
  return r
}

/* ─────────────────────────────── chrome ──────────────────────────────── */

function barreEtat(fonce, fond) {
  const b = boite('Barre d\'état', { dir: 'N', l: LARGEUR, h: BARRE, fond: fonce ? fond : undefined })
  const coul = fonce ? C.blanc : C.texte
  const t = texte('9:41', { ta: 11, gr: 'SemiBold', c: coul })
  t.x = MARGE + 2
  t.y = 8
  b.appendChild(t)
  const formes = [['barre', 4, 6], ['barre', 4, 9], ['barre', 4, 12]]
  formes.forEach((fo, i) => {
    const n = figure(fo[0], fo[1], coul, { ep: fo[2], rayon: 1 })
    n.x = LARGEUR - 92 + i * 7
    n.y = BARRE - 6 - fo[2] / 2 + 3
    b.appendChild(n)
  })
  const bat = figure('carre', 20, coul, { ep: 10, rayon: 3 })
  bat.x = LARGEUR - 66
  bat.y = 9
  b.appendChild(bat)
  return b
}

const ONGLETS = [['Accueil', 'cercle'], ['Calendrier', 'carre'], ['Alertes', 'losange'], ['Profil', 'anneau'], ['Plus', 'plus']]

function navBasse(actif) {
  const f = boite('Nav basse', { dir: 'N', l: LARGEUR, h: NAV })
  const verre = rangee('Pill nav', {
    l: LARGEUR - 24, h: NAV, rayon: 24, fond: C.blanc, alpha: 0.94, align: 'SPACE_BETWEEN',
    pad: [0, 8, 0, 8], ombre: true, valign: 'CENTER', bord: C.brand200, alphaBord: 0.7,
  })
  verre.x = 12
  verre.y = 0
  ONGLETS.forEach(([nom, forme]) => {
    const estActif = nom === actif
    const coul = estActif ? C.brand700 : C.texteDoux
    const bloc = pile('Onglet ' + nom, { gap: 4, align: 'CENTER', valign: 'CENTER', l: 62 })
    if (estActif) bloc.appendChild(figure('losange', 6, coul))
    if (forme === 'plus') bloc.appendChild(plusIcone(22, coul))
    else bloc.appendChild(figure(forme, 22, coul, { rayon: forme === 'carre' ? 5 : undefined, trait: 2 }))
    bloc.appendChild(texte(nom, { ta: 11, gr: estActif ? 'Bold' : 'Medium', c: coul, milieu: true }))
    verre.appendChild(bloc)
  })
  f.appendChild(verre)
  return f
}

function enteteTitre(titre, sousTitre, o) {
  o = o || {}
  const e = pile('Entête · ' + titre, {
    l: LARGEUR, gap: 2, pad: [BARRE + 10, 20, 16, 20],
    fond: o.fond || C.carte, rayons: [0, 0, 22, 22], ombre: o.ombre !== false,
  })
  if (o.retour) {
    const r = rangee('Retour', { gap: 10, align: 'MIN' })
    r.appendChild(fleche(18, C.brand700, 'gauche'))
    e.appendChild(r)
  }
  e.appendChild(texte(titre, { ta: o.ta || 20, gr: 'Bold', c: o.fonce ? C.blanc : C.texte }))
  if (sousTitre) e.appendChild(texte(sousTitre, { ta: 12, c: o.fonce ? C.blanc : C.texteDoux, l: LARGEUR - 40 }))
  if (o.extra) o.extra.forEach((n) => e.appendChild(n))
  return e
}

function titreSection(libelle) {
  // text-[11px] font-bold uppercase tracking-wide text-[var(--accent)]
  // (SettingsScreen.jsx:38) — --accent = 13 110 184 = brand-600.
  return texte(String(libelle).toUpperCase(), { ta: 11, gr: 'Bold', c: C.brand600, ls: 0.3 })
}

function blocVide(titre, chapeau, actions, o) {
  o = o || {}
  // EmptyState.jsx:3-14 — px-4 py-16 sans carte, icône 80 rounded-3xl bg-brand-100,
  // titre text-lg extrabold, description text-sm medium mt-1.5, action mt-6.
  const b = pile('État vide', { l: INTERNE, gap: 24, pad: [64, 16, 64, 16], align: 'CENTER', valign: 'CENTER' })
  b.appendChild(avatar(o.initiales || '∅', 80, { fond: C.brand100, c: C.brand700, rayon: 24 }))
  const t = pile('Titre + description', { gap: 6, align: 'CENTER', valign: 'CENTER' })
  t.appendChild(texte(titre, { ta: 18, gr: 'ExtraBold', c: C.texte, milieu: true }))
  t.appendChild(texte(chapeau, { ta: 14, gr: 'Medium', c: C.texteDoux, milieu: true, l: INTERNE - 32, lignes: o.lignes || 2 }))
  b.appendChild(t)
  if ((actions || []).length) {
    const a = pile('Actions état vide', { gap: 8, align: 'CENTER', valign: 'CENTER' })
    ;(actions || []).forEach((x) => a.appendChild(x))
    b.appendChild(a)
  }
  return b
}

function cadre(nom, o) {
  o = o || {}
  const f = figma.createFrame()
  f.name = nom
  f.layoutMode = 'NONE'
  f.resize(LARGEUR, HAUTEUR)
  f.fills = [solide(o.fond || C.page)]
  f.cornerRadius = 24
  f.clipsContent = true

  let y = 0
  if (o.entete) {
    o.entete.x = 0
    o.entete.y = 0
    f.appendChild(o.entete)
    y = o.entete.height
  }
  const barre = barreEtat(o.barreFonce, o.barreFond)
  barre.x = 0
  barre.y = 0
  f.appendChild(barre)

  if (o.contenu) {
    o.contenu.x = 0
    o.contenu.y = y
    f.appendChild(o.contenu)
  }
  if (o.nav) {
    const n = navBasse(o.nav)
    n.x = 0
    n.y = HAUTEUR - NAV
    f.appendChild(n)
  }
  if (o.pied) {
    o.pied.x = 0
    o.pied.y = HAUTEUR - o.pied.height
    f.appendChild(o.pied)
  }
  if (o.fab) {
    o.fab.x = LARGEUR - MARGE - o.fab.width
    o.fab.y = HAUTEUR - (o.nav ? NAV : 0) - MARGE - o.fab.height
    f.appendChild(o.fab)
  }
  return f
}

function contenu(nom, enfants, o) {
  const c = pile(nom, Object.assign({ l: LARGEUR, gap: 12, pad: [16, MARGE, 24, MARGE] }, o))
  enfants.filter(Boolean).forEach((e) => c.appendChild(e))
  return c
}

/* ─────────────────────────────── 01 accueil ──────────────────────────── */

function enteteAccueil(solde, delta, groupes) {
  const e = pile('Entête accueil', {
    l: LARGEUR, gap: 12, pad: [BARRE + 8, 20, 22, 20], degrade: [C.brand600, C.enteteBas],
    rayons: [0, 0, 24, 24],
  })
  const salut = rangee('Salutation', { l: INTERNE, gap: 10, align: 'SPACE_BETWEEN' })
  salut.appendChild(texte('Bonjour 👋', { ta: 13, c: C.blanc }))
  // Ocre plat : le dégradé #D98324→#C06E12 ferme tomber #0F2A44 à 3,82:1 sur
  // son arrêt bas, le fond uni tient 5,03:1.
  salut.appendChild(avatar('AK', 32, { fond: C.ocre, c: C.ocreTexte }))
  e.appendChild(salut)
  e.appendChild(texte('Mes tontines', { ta: 20, gr: 'Bold', c: C.blanc }))

  const soldes = pile('Carte solde', {
    l: INTERNE, gap: 2, pad: [12, 12, 12, 12], fond: C.carte, rayon: 24, ombre: true,
  })
  soldes.appendChild(texte('Solde total de vos tontines', { ta: 12, gr: 'Medium', c: C.texteDoux, ls: 0.3 }))
  soldes.appendChild(texte(solde, { ta: 32, gr: 'ExtraBold', c: C.texte }))
  const progression = rangee('Delta', { gap: 10, align: 'SPACE_BETWEEN', l: INTERNE - 24 })
  progression.appendChild(texte(delta, { ta: 12, gr: 'SemiBold', c: C.success700 }))
  progression.appendChild(texte(groupes, { ta: 12, c: C.texteDoux }))
  soldes.appendChild(progression)
  e.appendChild(soldes)

  const recherche = rangee('Champ recherche', {
    l: INTERNE, h: 48, rayon: 12, fond: C.carte, gap: 10, pad: [0, 14, 0, 14], align: 'MIN',
  })
  recherche.appendChild(figure('anneau', 16, C.texteDoux, { trait: 2 }))
  recherche.appendChild(texte('Rechercher une tontine…', { ta: 15, c: C.texteDoux }))
  e.appendChild(recherche)
  return e
}

function carteTontine(nom, pastilleTexte, p, tour, montant) {
  const c = rangee('Carte tontine · ' + nom, {
    // p-3.5 gap-[13px] rounded-2xl (DashboardScreen.jsx:434)
    l: INTERNE, gap: 13, pad: [14, 14, 14, 14], fond: C.carte, rayon: 16, ombre: true, align: 'MIN', valign: 'CENTER',
  })
  c.appendChild(figure('barre', 4, TEINTE.bar, { ep: 56, rayon: 2 }))
  // h-[46px] w-[46px] rounded-[13px] (DashboardScreen.jsx:443)
  c.appendChild(avatar('🌟T', 46, { degrade: TEINTE.ava, rayon: 13 }))
  const col = pile('Infos tontine', { l: 210, gap: 4 })
  const titre = rangee('Titre', { l: 210, gap: 8, align: 'SPACE_BETWEEN' })
  // text-[15px] font-bold (DashboardScreen.jsx:449)
  titre.appendChild(texte(nom, { ta: 15, gr: 'Bold', l: 108 }))
  titre.appendChild(pastille(pastilleTexte, p))
  col.appendChild(titre)
  col.appendChild(texte(tour + ' · ' + montant, { ta: 12, c: C.texteDoux }))
  c.appendChild(col)
  return c
}

function lienDiscret() {
  const r = rangee('Liens discrets', { l: INTERNE, gap: 10, align: 'CENTER' })
  r.appendChild(texte('Rejoindre avec un code', { ta: 12, gr: 'SemiBold', c: C.brand700 }))
  r.appendChild(figure('cercle', 3, C.texteDoux))
  r.appendChild(texte('Statistiques', { ta: 12, gr: 'SemiBold', c: C.brand700 }))
  return r
}

function fabAccueil() {
  const f = rangee('FAB · Nouvelle tontine', {
    h: 52, rayon: 26, fond: C.ocre, gap: 8, pad: [0, 20, 0, 20], align: 'CENTER', ombre: true,
  })
  f.appendChild(plusIcone(16, C.ocreTexte))
  // Blanc sur #D98324 = 2,95:1 ; #0F2A44 relève à 5,03:1 (AA).
  f.appendChild(texte('Nouvelle tontine', { ta: 14, gr: 'Bold', c: C.ocreTexte }))
  return f
}

function e01Normal() {
  const c = contenu('Contenu accueil', [
    (() => {
      const r = rangee('Section', { l: INTERNE, gap: 10, align: 'SPACE_BETWEEN' })
      r.appendChild(texte('Mes tontines', { ta: 15, gr: 'Bold' }))
      r.appendChild(texte('Tout voir', { ta: 12, gr: 'SemiBold', c: C.brand700 }))
      return r
    })(),
    carteTontine(GROUPE, '3 en attente', PILL.attente, 'Tour 2 / 5', COTISATION),
    lienDiscret(),
  ])
  return cadre('Tontine/01-Accueil · normal', {
    entete: enteteAccueil('30 000 FCFA', '▲ 10 000 ce mois', '1 groupe actif'),
    barreFonce: true, barreFond: C.brand600,
    contenu: c,
    nav: 'Accueil',
    fab: fabAccueil(),
  })
}

function e01Vide() {
  const c = contenu('Contenu accueil vide', [
    blocVide('Créez votre première tontine',
      'Ajoutez les membres et le montant, puis suivez les tours depuis cet écran.',
      [bouton('Rejoindre avec un code', { secondaire: true }), bouton('Essayer avec une tontine de démonstration', { secondaire: true, ta: 13 })],
      { initiales: '＋', lignes: 2 }),
    lienDiscret(),
  ])
  return cadre('Tontine/01-Accueil · état vide', {
    entete: enteteAccueil('0 FCFA', '▲ 0 ce mois', '0 groupe actif'),
    barreFonce: true, barreFond: C.brand600,
    contenu: c,
    nav: 'Accueil',
    fab: fabAccueil(),
  })
}

/* ─────────────────────────────── 02 argent ───────────────────────────── */

function ongletsArgent(actif) {
  const r = rangee('Onglets argent', { l: INTERNE, gap: 8, align: 'MIN' })
  ;['Paiements', 'Prêts'].forEach((nom) => {
    r.appendChild(nom === actif
      ? pastille(nom, { fond: C.brand600, texte: C.blanc }, { h: 48, ta: 12 })
      : pastille(nom, { fond: C.carte, texte: C.texteDoux }, { h: 48, ta: 12 }))
  })
  return r
}

function carteCompte() {
  const c = carte('Carte compte de collecte', { gap: 8 })
  c.appendChild(texte('Compte de collecte (cotisation)', { ta: 11, gr: 'SemiBold', c: C.texteDoux, ls: 0.4 }))
  const select = rangee('Select moyen', {
    l: INTERNE - 24, h: 48, rayon: 14, bord: C.bord, fond: C.carte, gap: 10, pad: [0, 14, 0, 14], align: 'SPACE_BETWEEN',
  })
  select.appendChild(texte('Wave', { ta: 14 }))
  select.appendChild(fleche(14, C.texteDoux, 'droite'))
  c.appendChild(select)
  c.appendChild(bouton('Enregistrer le compte', { pleine: true, secondaire: true }))
  return c
}

function carteTourRegler() {
  const c = carte('Carte tour à régler', { gap: 8 })
  const titre = rangee('Titre tour', { l: INTERNE - 24, gap: 10, align: 'SPACE_BETWEEN' })
  titre.appendChild(texte('Tour à régler', { ta: 11, gr: 'SemiBold', c: C.texteDoux, ls: 0.4 }))
  titre.appendChild(pastille('#2 · Fatou Traoré', { fond: C.brand50, texte: C.brand700 }))
  c.appendChild(titre)
  c.appendChild(texte('10 000 / 25 000 FCFA', { ta: 20, gr: 'Bold' }))
  c.appendChild(jauge(40, { l: INTERNE - 24 }))
  c.appendChild(texte('2 cotisations reçues sur 5', { ta: 12, c: C.texteDoux }))
  c.appendChild(bouton('Pot complet — marquer reçu', { pleine: true, fond: C.brand600 }))
  return c
}

function ligneRapprochement() {
  const r = rangee('Ligne rapprochement', {
    l: INTERNE, h: 56, rayon: 16, fond: C.carte, bord: C.bord, gap: 10, pad: [0, 16, 0, 16], align: 'SPACE_BETWEEN', ombre: true,
  })
  r.appendChild(texte('Rapprocher un relevé Wave / Orange Money', { ta: 13, gr: 'SemiBold', l: INTERNE - 60 }))
  r.appendChild(fleche(16, C.brand700, 'droite'))
  return r
}

function e02Normal() {
  const c = contenu('Contenu argent', [
    ongletsArgent('Paiements'),
    carteCompte(),
    carteTourRegler(),
    ligneRapprochement(),
    titreSection('Voir aussi'),
    ligneInfoSimple('Planning & ordre'),
    ligneInfoSimple('Historique'),
    ligneInfoSimple('Journal d\'audit'),
  ])
  return cadre('Tontine/02-Argent · normal', {
    entete: enteteTitre('Paiements', 'Aya Kouassi · responsable de ' + GROUPE),
    contenu: c,
    // /groupe/:id → BottomNav masquée (src/components/BottomNav.jsx, OCCULTER_PREFIXES)
  })
}

function e02Vide() {
  const banniere = rangee('Bannière lecture seule', {
    l: INTERNE, rayon: 14, fond: C.brand50, gap: 8, pad: [12, 14, 12, 14], align: 'MIN', valign: 'CENTER',
  })
  banniere.appendChild(texte('Lecture seule : vos cotisations sont confirmées par le responsable.',
    { ta: 12, c: C.brand700, l: INTERNE - 28, lignes: 2 }))
  const c = contenu('Contenu argent vide', [
    ongletsArgent('Paiements'),
    banniere,
    blocVide('Aucun tour', 'Générez le planning : un tour par membre, espacé de 7 jour(s).',
      [bouton('Générer le planning', { secondaire: true })], { initiales: '⏱', lignes: 2 }),
  ])
  return cadre('Tontine/02-Argent · état vide', {
    entete: enteteTitre('Paiements', 'Konan Yao · membre de ' + GROUPE),
    contenu: c,
  })
}

/* ────────────────────────────── 03 planning ──────────────────────────── */

function carteCagnotte() {
  const c = carte('Carte cagnotte', { gap: 8 })
  c.appendChild(texte('Cagnotte', { ta: 11, gr: 'SemiBold', c: C.texteDoux, ls: 0.4 }))
  const montants = rangee('Montants cagnotte', { l: INTERNE - 24, gap: 10, align: 'SPACE_BETWEEN' })
  montants.appendChild(texte('10 000 / 25 000 FCFA', { ta: 20, gr: 'ExtraBold' }))
  montants.appendChild(texte('40 %', { ta: 13, gr: 'SemiBold', c: C.brand700 }))
  c.appendChild(montants)
  // mt-1.5 h-2.5 (ToursTab.jsx:97)
  c.appendChild(jauge(40, { l: INTERNE - 24, h: 10 }))
  const dates = pile('Dates', { l: INTERNE - 24, gap: 3 })
  dates.appendChild(texte('Date du tirage : 11/11/2026', { ta: 12, c: C.texteDim }))
  dates.appendChild(texte('Pénalité automatique : 2 %/jour en cas de retard', { ta: 12, c: C.warning700, gr: 'SemiBold' }))
  c.appendChild(dates)
  return c
}

function avertissementPlanning() {
  const c = pile('Avertissement planning', {
    l: INTERNE, gap: 10, rayon: 16, fond: C.warning50, bord: C.warning500, alphaBord: 0.4,
    pad: [12, 14, 12, 14], valign: 'MAX',
  })
  c.appendChild(texte('1 membre sans tour : Ibrahim Bakayoko', { ta: 12, gr: 'SemiBold', c: C.warning700, l: INTERNE - 28 }))
  // Blanc sur warning-600 = 3,18:1 → warning-700 (5,02:1).
  c.appendChild(bouton('Générer le planning', { fond: C.warning700, ta: 13 }))
  return c
}

function bandeauProchainTour() {
  const c = rangee('Prochain tour', {
    l: INTERNE, gap: 12, rayon: 16, fond: C.brand50, pad: [12, 14, 12, 14], align: 'SPACE_BETWEEN', valign: 'CENTER',
  })
  const col = pile('Colonne prochain tour', { l: 150, gap: 2 })
  col.appendChild(texte('#2 · Fatou Traoré', { ta: 14, gr: 'Bold', c: C.brand700, l: 150 }))
  col.appendChild(texte('Échéance : 11/11/2026', { ta: 12, c: C.texteDim }))
  c.appendChild(col)
  c.appendChild(bouton('Lancer le tour', { fond: C.brand600, ta: 13 }))
  return c
}

function ligneTour(numero, badge, p, benef, montant, date, actions) {
  const c = carte('Tour #' + numero, { gap: 10 })
  const titre = rangee('Titre tour', { l: INTERNE - 24, gap: 10, align: 'SPACE_BETWEEN' })
  titre.appendChild(texte('Tour #' + numero, { ta: 14, gr: 'Bold' }))
  titre.appendChild(pastille(badge, p))
  c.appendChild(titre)
  c.appendChild(texte(montant, { ta: 24, gr: 'ExtraBold' }))
  const benefRow = rangee('Bénéficiaire', { gap: 8, align: 'MIN' })
  benefRow.appendChild(avatar(benef.split(' ').map((m) => m[0]).join('').slice(0, 2), 24, { degrade: TEINTE.ava }))
  benefRow.appendChild(texte(benef + ' · ' + date, { ta: 12, c: C.texteDoux }))
  c.appendChild(benefRow)
  if (actions && actions.length) {
    const r = rangee('Actions tour', { gap: 8, align: 'MIN' })
    actions.forEach((a) => r.appendChild(bouton(a, { secondaire: true, ta: 12 })))
    c.appendChild(r)
  }
  return c
}

function e03Normal() {
  const c = contenu('Contenu planning', [
    carteCagnotte(),
    avertissementPlanning(),
    bandeauProchainTour(),
    ligneTour(1, 'Reçu', PILL.ok, 'Aya Kouassi', POT, 'Reçu le 28/10/2026', ['Voir la preuve']),
    ligneTour(2, 'En attente', PILL.attente, 'Konan Yao', '10 000 FCFA', 'Échéance : 04/11/2026', ['Relancer', 'Appeler']),
    ligneTour(3, 'En retard', PILL.retard, 'Ibrahim Bakayoko', COTISATION, 'Échéance : 18/11/2026', ['Annuler ce tour']),
  ])
  return cadre('Tontine/03-Planning · normal', {
    entete: enteteTitre('Planning & ordre', GROUPE + ' · 5 membres'),
    contenu: c,
    nav: 'Calendrier',
  })
}

function e03Vide() {
  const c = contenu('Contenu planning vide', [
    carteCagnotte(),
    blocVide('Aucun tour',
      'Ajoutez des membres dans l\'onglet Membres, puis générez le planning des tours.',
      [bouton('Ajouter des membres', { secondaire: true })], { initiales: '⏱', lignes: 2 }),
  ])
  return cadre('Tontine/03-Planning · état vide', {
    entete: enteteTitre('Planning & ordre', GROUPE + ' · 5 membres'),
    contenu: c,
    nav: 'Calendrier',
  })
}

/* ───────────────────────────── 04 discussion ─────────────────────────── */

function bulleAutre(auteur, contenuTexte, heure) {
  const r = rangee('Message ' + auteur, { l: INTERNE, gap: 8, align: 'MIN', valign: 'MAX' })
  r.appendChild(avatar(auteur.split(' ').map((m) => m[0]).join('').slice(0, 2), 28, { fond: C.brand100, c: C.brand700 }))
  const col = pile('Colonne ' + auteur, { l: 270, gap: 3 })
  col.appendChild(texte(auteur, { ta: 11, gr: 'SemiBold', c: C.brand700 }))
  const b = pile('Bulle', { l: 270, pad: [8, 12, 8, 12], fond: C.carte, rayons: [16, 16, 16, 8], bord: C.bord })
  b.appendChild(texte(contenuTexte, { ta: 14, c: C.texteDim, l: 246 }))
  col.appendChild(b)
  col.appendChild(texte(heure, { ta: 10, c: C.texteDoux }))
  r.appendChild(col)
  return r
}

function bulleMoi(contenuTexte, heure) {
  const r = rangee('Message moi', { l: INTERNE, gap: 8, align: 'MAX', valign: 'MAX' })
  const col = pile('Colonne moi', { l: 270, gap: 3 })
  const b = pile('Bulle moi', { l: 270, pad: [8, 12, 8, 12], degrade: [C.brand600, C.brand700], rayons: [16, 16, 8, 16] })
  b.appendChild(texte(contenuTexte, { ta: 14, c: C.blanc, l: 246 }))
  col.appendChild(b)
  const pied = rangee('Pied bulle', { gap: 6, align: 'SPACE_BETWEEN', l: 270 })
  pied.appendChild(texte(heure, { ta: 10, c: C.texteDoux }))
  pied.appendChild(texte('✓✓ lu', { ta: 10, c: C.brand700, gr: 'Medium' }))
  col.appendChild(pied)
  r.appendChild(col)
  return r
}

function separateurDate(libelle) {
  const r = rangee('Séparateur ' + libelle, { l: INTERNE, gap: 10, align: 'CENTER' })
  r.appendChild(figure('barre', 60, C.bord, { ep: 1 }))
  r.appendChild(texte(libelle, { ta: 11, gr: 'SemiBold', c: C.texteDoux }))
  r.appendChild(figure('barre', 60, C.bord, { ep: 1 }))
  return r
}

function barreEpinglee(libelle) {
  const r = rangee('Épinglé', {
    l: INTERNE, gap: 8, rayon: 14, fond: C.brand50, pad: [10, 12, 10, 12], align: 'SPACE_BETWEEN', valign: 'CENTER',
  })
  r.appendChild(texte('Épinglé · ' + libelle, { ta: 12, gr: 'SemiBold', c: C.brand700, l: 250 }))
  r.appendChild(figure('losange', 8, C.brand600))
  return r
}

function composeur(placeholder) {
  const r = rangee('Composeur', {
    l: LARGEUR, h: 72, fond: C.carte, bord: C.bord, trait: 1, gap: 10, pad: [10, 16, 10, 16], align: 'SPACE_BETWEEN',
  })
  const champ1 = rangee('Saisie message', { l: 270, h: 48, rayon: 24, fond: C.page, bord: C.bord, gap: 8, pad: [0, 14, 0, 14], align: 'MIN' })
  champ1.appendChild(texte(placeholder, { ta: 14, c: C.texteDoux }))
  r.appendChild(champ1)
  const envoyer = boite('Envoyer', { dir: 'N', l: 48, h: 48 })
  envoyer.cornerRadius = 24
  envoyer.fills = [solide(C.brand600)]
  const t = texte('➤', { ta: 18, gr: 'Bold', c: C.blanc })
  t.x = 24 - t.width / 2
  t.y = 24 - t.height / 2
  envoyer.appendChild(t)
  r.appendChild(envoyer)
  return r
}

function enteteDiscussion(sousTitre) {
  const e = pile('Entête discussion', { l: LARGEUR, gap: 10, pad: [BARRE + 6, 20, 14, 20], fond: C.carte, rayons: [0, 0, 22, 22], ombre: true })
  const r = rangee('Retour + titre', { l: INTERNE, gap: 10, align: 'MIN', valign: 'CENTER' })
  r.appendChild(fleche(20, C.brand700, 'gauche'))
  const col = pile('Titre groupe', { l: 196, gap: 2 })
  col.appendChild(texte(GROUPE, { ta: 16, gr: 'Bold', l: 196 }))
  col.appendChild(texte(sousTitre, { ta: 11, c: C.texteDoux }))
  r.appendChild(col)
  const menu = boite('Menu ⋮', { dir: 'N', l: 48, h: 48 })
  menu.cornerRadius = 24
  menu.fills = [solide(C.page)]
  const pts = texte('⋮', { ta: 18, gr: 'Bold', c: C.texteDoux })
  pts.x = 24 - pts.width / 2
  pts.y = 24 - pts.height / 2
  menu.appendChild(pts)
  r.appendChild(menu)
  e.appendChild(r)
  const recherche = rangee('Recherche discussion', {
    l: INTERNE, rayon: 14, fond: C.page, gap: 10, pad: [0, 14, 0, 14], align: 'MIN',
  })
  recherche.appendChild(figure('anneau', 15, C.texteDoux, { trait: 2 }))
  recherche.appendChild(texte('Un mot, un nom…', { ta: 14, c: C.texteDoux }))
  e.appendChild(recherche)
  return e
}

function e04Normal() {
  const c = contenu('Contenu discussion', [
    barreEpinglee('Qui n\'a pas encore payé ?'),
    separateurDate('30/10/2026'),
    bulleAutre('Aya Kouassi', 'Qui doit payer cette semaine ?', '08:12'),
    bulleMoi('Fais un résumé de la collecte', '08:14'),
    bulleAutre('Fatou Traoré', 'Relance les membres en retard', '09:02'),
    separateurDate('04/11/2026'),
    bulleAutre('Konan Yao', 'Génère un rapport PDF de la tontine', '11:47'),
    pastille('Nouveaux messages', { fond: C.brand600, texte: C.blanc }, { h: 28, ta: 11 }),
  ])
  const f = cadre('Tontine/04-Discussion · normal', {
    entete: enteteDiscussion('5 membres · discussion locale'),
    contenu: c,
    fond: C.page,
  })
  const pied = composeur('Écrire au groupe…')
  pied.x = 0
  pied.y = HAUTEUR - 72
  f.appendChild(pied)
  return f
}

function e04Vide() {
  const c = contenu('Contenu discussion vide', [
    separateurDate('04/11/2026'),
    blocVide('Discussion vide',
      'Écrivez le premier message : réponses citées, photos et accusés de lecture sont de la partie.',
      [], { initiales: '💬', lignes: 3 }),
  ])
  const f = cadre('Tontine/04-Discussion · état vide', {
    entete: enteteDiscussion('5 membres · discussion locale'),
    contenu: c,
    fond: C.page,
  })
  const pied = composeur('Écrire au groupe…')
  pied.x = 0
  pied.y = HAUTEUR - 72
  f.appendChild(pied)
  return f
}

/* ────────────────────────────── 05 épargne ───────────────────────────── */

function carteTotalEpargne(total, pct) {
  const c = carte('Carte total épargné', { gap: 6 })
  c.appendChild(texte('Total épargné', { ta: 11, gr: 'SemiBold', c: C.texteDoux, ls: 0.4 }))
  c.appendChild(texte(total, { ta: 32, gr: 'ExtraBold' }))
  c.appendChild(texte(pct + ' % de l\'objectif global', { ta: 12, gr: 'SemiBold', c: C.brand700 }))
  // h-2.5 (EpargneScreen.jsx:236)
  c.appendChild(jauge(pct, { l: INTERNE - 24, h: 10 }))
  return c
}

function versementsRapides() {
  const r = rangee('Versements rapides', { l: INTERNE, gap: 8, align: 'MIN' })
  r.appendChild(bouton('Verser 500 ' + DEVISE, { secondaire: true, ta: 13 }))
  r.appendChild(bouton('Verser 1 000 ' + DEVISE, { secondaire: true, ta: 13 }))
  return r
}

function accrocheEpargne() {
  const c = pile('Accroche', { l: INTERNE, gap: 8, pad: [12, 14, 12, 14], fond: C.brand50, rayon: 16 })
  c.appendChild(texte('On commence petit. 500 FCFA aujourd\'hui = 60 000 dans 4 mois',
    { ta: 13, gr: 'SemiBold', c: C.brand700, l: INTERNE - 28, lignes: 2 }))
  c.appendChild(texte('Local. Privé. Sauvegardable depuis Réglages.', { ta: 11, c: C.texteDoux }))
  return c
}

function carteObjectif(nom, verse, objectif, pct, o) {
  const c = carte('Objectif ' + nom, { gap: 8 })
  const titre = rangee('Titre objectif', { l: INTERNE - 24, gap: 10, align: 'SPACE_BETWEEN' })
  titre.appendChild(texte(nom, { ta: 15, gr: 'Bold' }))
  titre.appendChild(o.atteint
    ? pastille('Atteint', { fond: C.success100, texte: C.success700 })
    : pastille(pct + ' %', { fond: C.brand50, texte: C.brand700 }))
  c.appendChild(titre)
  c.appendChild(texte(verse + ' / ' + objectif + ' ' + DEVISE, { ta: 18, gr: 'ExtraBold' }))
  if (o.echeance) c.appendChild(texte('Échéance ' + o.echeance, { ta: 12, c: C.texteDoux }))
  c.appendChild(jauge(pct, { l: INTERNE - 24, c: o.atteint ? C.success600 : C.brand600 }))
  const r = rangee('Actions objectif', { gap: 8, align: 'MIN' })
  r.appendChild(bouton('Verser', { fond: C.brand600, ta: 12 }))
  r.appendChild(bouton('Détails', { secondaire: true, ta: 12 }))
  c.appendChild(r)
  return c
}

function enteteEpargne() {
  const e = pile('Entête épargne', { l: LARGEUR, gap: 2, pad: [BARRE + 10, 20, 14, 20], fond: C.carte, rayons: [0, 0, 22, 22], ombre: true })
  const r = rangee('Titre + bouton', { l: INTERNE, gap: 10, align: 'SPACE_BETWEEN', valign: 'CENTER' })
  r.appendChild(texte('Mes Épargnes', { ta: 18, gr: 'Bold' }))
  r.appendChild(bouton('Nouvel objectif', { fond: C.brand600, ta: 12 }))
  e.appendChild(r)
  return e
}

function ligneEcriture(date, type, montant, c) {
  const r = rangee('Écriture ' + type, {
    l: INTERNE - 24, h: 40, gap: 8, rayon: 12, fond: C.page, pad: [0, 12, 0, 12], align: 'SPACE_BETWEEN',
  })
  r.appendChild(texte(date + ' · ' + type, { ta: 12, c: C.texteDim }))
  r.appendChild(texte(montant, { ta: 12, gr: 'SemiBold', c: c }))
  return r
}

function carteEcritures() {
  const c = carte('Historique épargne', { gap: 8 })
  c.appendChild(titreSection('Historique'))
  c.appendChild(ligneEcriture('02/11/2026', 'versement', '+500 ' + DEVISE, C.success700))
  c.appendChild(ligneEcriture('28/10/2026', 'retrait', '−5 000 ' + DEVISE, C.warning700))
  return c
}

function e05Normal() {
  const c = contenu('Contenu épargne', [
    carteTotalEpargne('37 000 FCFA', 49),
    versementsRapides(),
    accrocheEpargne(),
    carteObjectif('Urgence', '12 000', '50 000', 24, { echeance: '31/12/2026' }),
    carteObjectif('Cadeau', '25 000', '25 000', 100, { atteint: true }),
    carteEcritures(),
  ])
  return cadre('Tontine/05-Épargne · normal', {
    entete: enteteEpargne(),
    contenu: c,
    // /epargne n'est pas un onglet de la nav → barre affichée, aucun onglet actif
    nav: 'Aucun',
  })
}

function modeleEpargne(nom, montant) {
  const c = pile('Modèle ' + nom, {
    l: 100, gap: 4, pad: [12, 8, 12, 8], fond: C.carte, bord: C.bord, rayon: 16, align: 'CENTER', valign: 'CENTER',
  })
  c.appendChild(figure('carre', 32, C.brand50, { rayon: 12 }))
  c.appendChild(texte(nom, { ta: 11, gr: 'SemiBold', c: C.texteDim, milieu: true }))
  c.appendChild(texte(montant + ' ' + DEVISE, { ta: 10, c: C.texteDoux, milieu: true }))
  return c
}

function grilleModeles() {
  const r = rangee('Modèles épargne', { l: INTERNE, gap: 12, align: 'SPACE_BETWEEN' })
  r.appendChild(modeleEpargne('Urgence', '50 000'))
  r.appendChild(modeleEpargne('Projet', '200 000'))
  r.appendChild(modeleEpargne('Cadeau', '25 000'))
  return r
}

function e05Vide() {
  const c = contenu('Contenu épargne vide', [
    carteTotalEpargne('0 FCFA', 0),
    blocVide('Commencez avec 500 ' + DEVISE,
      'Créez un objectif en 1 tap et faites votre tout premier versement.',
      [bouton('Commencer avec 500 ' + DEVISE, { pleine: true, fond: C.brand600 })], { initiales: '＋', lignes: 1 }),
    grilleModeles(),
  ])
  return cadre('Tontine/05-Épargne · état vide', {
    entete: enteteEpargne(),
    contenu: c,
    nav: 'Aucun',
  })
}

/* ───────────────────────────── 06 statistiques ───────────────────────── */

function carteKpi(libelle, valeur, sous, c) {
  const k = pile('KPI ' + libelle, { l: 158, gap: 3, pad: [12, 14, 12, 14], fond: C.carte, rayon: 18, ombre: true })
  k.appendChild(texte(libelle, { ta: 11, gr: 'SemiBold', c: C.texteDoux, ls: 0.4 }))
  k.appendChild(texte(valeur, { ta: 20, gr: 'ExtraBold', c: c }))
  if (sous) k.appendChild(texte(sous, { ta: 11, c: C.texteDoux }))
  return k
}

function selecteurTontine() {
  const c = pile('Sélecteur tontine', { l: INTERNE, gap: 6 })
  c.appendChild(texte('Choisir une tontine', { ta: 11, gr: 'SemiBold', c: C.texteDoux, ls: 0.4 }))
  const r = rangee('Chip tontine', {
    l: INTERNE, h: 48, rayon: 14, fond: C.brand600, gap: 10, pad: [0, 14, 0, 14], align: 'SPACE_BETWEEN',
  })
  r.appendChild(texte(GROUPE, { ta: 13, gr: 'SemiBold', c: C.blanc, l: INTERNE - 60 }))
  r.appendChild(fleche(14, C.blanc, 'droite'))
  return c
}

function carteProgression() {
  const c = carte('Carte progression', { gap: 8 })
  c.appendChild(texte('Progression : 1/5 tours reçus', { ta: 14, gr: 'SemiBold' }))
  c.appendChild(jauge(20, { l: INTERNE - 24, h: 10 }))
  c.appendChild(texte('Prochain tour : #2 · 11/11/2026', { ta: 12, c: C.texteDoux }))
  return c
}

function grille4() {
  const g = (l, v, c) => {
    const k = pile('KPI ' + l, { l: 158, gap: 2, pad: [10, 12, 10, 12], fond: C.carte, rayon: 16, bord: C.bord })
    k.appendChild(texte(l, { ta: 11, gr: 'SemiBold', c: C.texteDoux }))
    k.appendChild(texte(v, { ta: 16, gr: 'Bold', c: c }))
    return k
  }
  const lignes = [
    [['Cotisé', '30 000', C.success700], ['Pénalités', '0', C.danger700]],
    [['Pot reçu', '25 000', C.brand700], ['Solde groupe', '5 000', C.texte]],
  ]
  const c = pile('Grille 4 KPI', { l: INTERNE, gap: 10 })
  lignes.forEach((ligne) => {
    const r = rangee('Rangée KPI', { l: INTERNE, gap: 10, align: 'SPACE_BETWEEN' })
    ligne.forEach(([l, v, col]) => r.appendChild(g(l, v, col)))
    c.appendChild(r)
  })
  return c
}

function repartitionMembres() {
  const c = carte('Répartition par membre', { gap: 10 })
  c.appendChild(texte('Répartition par membre', { ta: 14, gr: 'SemiBold' }))
  const barres = [[100, '10 000'], [100, '10 000'], [40, '4 000'], [0, '0'], [0, '0']]
  NOMS.forEach((nom, i) => {
    const bloc = pile('Membre ' + nom, { l: INTERNE - 24, gap: 4 })
    const r = rangee('Ligne ' + nom, { l: INTERNE - 24, gap: 8, align: 'SPACE_BETWEEN' })
    r.appendChild(texte(nom, { ta: 12, c: C.texteDim, l: 170 }))
    r.appendChild(texte(barres[i][1] + ' ' + DEVISE, { ta: 12, gr: 'SemiBold', c: C.texteDim }))
    bloc.appendChild(r)
    bloc.appendChild(jauge(barres[i][0], { l: INTERNE - 24, h: 10, c: barres[i][0] ? C.success500 : C.bordDoux }))
    c.appendChild(bloc)
  })
  return c
}

function carteRetards() {
  const c = pile('Membres en retard', {
    l: INTERNE, gap: 6, pad: [14, 16, 14, 16], fond: C.danger50, rayon: 20,
  })
  c.appendChild(texte('Membres en retard', { ta: 14, gr: 'Bold', c: C.danger700 }))
  c.appendChild(texte('1 tour · 5 000 FCFA encours', { ta: 12, gr: 'SemiBold', c: C.danger700 }))
  c.appendChild(texte('Ibrahim Bakayoko', { ta: 12, c: C.texteDim }))
  return c
}

function e06Normal() {
  const r1 = rangee('Deux KPI', { l: INTERNE, gap: 10, align: 'SPACE_BETWEEN' })
  r1.appendChild(carteKpi('Total cotisé', '30 000 FCFA', '5 membres · 1 groupe', C.brand600))
  r1.appendChild(carteKpi('Pot reçu', '25 000 FCFA', 'Pénalités : 0 FCFA', C.texte))
  const c = contenu('Contenu stats', [
    r1,
    selecteurTontine(),
    carteProgression(),
    grille4(),
    repartitionMembres(),
    carteRetards(),
  ])
  return cadre('Tontine/06-Stats · normal', {
    entete: enteteTitre('Statistiques', null),
    contenu: c,
    nav: 'Aucun',
  })
}

function e06Vide() {
  const c = contenu('Contenu stats vide', [
    blocVide('Aucune donnée', 'Créez une tontine pour voir des statistiques.',
      [bouton('Créer une tontine', { secondaire: true })], { initiales: '∅', lignes: 1 }),
    titreSection('Répartition par membre'),
    texte('Aucune cotisation enregistrée.', { ta: 12, c: C.texteDoux, l: INTERNE }),
  ])
  return cadre('Tontine/06-Stats · état vide', {
    entete: enteteTitre('Statistiques', null),
    contenu: c,
    nav: 'Aucun',
  })
}

/* ────────────────────────────── 07 réglages ──────────────────────────── */

function toggle(actif) {
  const t = boite('Toggle ' + (actif ? 'ON' : 'OFF'), { dir: 'N', l: 44, h: 26 })
  t.cornerRadius = 13
  t.fills = [solide(actif ? C.brand600 : C.bord)]
  const knob = figma.createEllipse()
  knob.name = 'molette'
  knob.resize(20, 20)
  knob.fills = [solide(C.blanc)]
  knob.x = actif ? 21 : 3
  knob.y = 3
  t.appendChild(knob)
  return t
}

function ligneReglages(libelle, sous, o) {
  o = o || {}
  const r = rangee('Réglage · ' + libelle, {
    l: INTERNE, gap: 12, pad: [12, 4, 12, 4], align: 'SPACE_BETWEEN', valign: 'CENTER',
  })
  const col = pile('Textes', { l: 196, gap: 2 })
  col.appendChild(texte(libelle, { ta: 14, gr: 'SemiBold', c: o.danger ? C.error : C.texte }))
  if (sous) col.appendChild(texte(sous, { ta: 12, c: C.texteDoux, l: 196 }))
  r.appendChild(col)
  if (o.toggle != null) r.appendChild(toggle(o.toggle))
  else if (o.badge) r.appendChild(pastille(o.badge, o.badge === 'ON' ? PILL.ok : { fond: C.page, texte: C.texteDoux }))
  else if (o.action) r.appendChild(bouton(o.action, { secondaire: true, ta: 12 }))
  else r.appendChild(fleche(16, C.texteDoux, 'droite'))
  return r
}

function groupeReglages(enfants) {
  const c = pile('Groupe réglages', { l: INTERNE, gap: 0, pad: [4, 12, 4, 12], fond: C.carte, rayon: 20, ombre: true })
  enfants.filter(Boolean).forEach((e) => c.appendChild(e))
  return c
}

function sectionReglages(o, avecPin) {
  const c = contenu('Contenu réglages', [
    titreSection('Général'),
    groupeReglages([
      ligneReglages('Membres', 'Ajouter et gérer les gens du groupe', { action: 'Régler' }),
      ligneReglages('Compte', 'Votre profil et photo', { action: 'Modifier' }),
      ligneReglages('Devise & format', 'FCFA · JJ/MM/AAAA', {}),
      ligneReglages('Thème dynamique', avecPin ? 'Thème fixe Akan' : 'Thème météo & heure', { toggle: avecPin ? false : true }),
      ligneReglages('Mode léger', 'Apparence', { toggle: true }),
      ligneReglages('Apparence', 'Langue · Français', {}),
      ligneReglages('Notifications', 'Messages · nouveaux membres · distribution', {}),
    ]),
    titreSection('Sécurité & confidentialité'),
    groupeReglages([
      ligneReglages('Sécurité', 'Protégez l\'accès avec un code PIN', { badge: avecPin ? 'ON' : 'OFF' }),
      avecPin ? ligneReglages('Code PIN au démarrage', null, { toggle: true }) : ligneReglages('Activer le code PIN', null, { action: 'Activer' }),
      ligneReglages('Déverrouillage biométrique', null, { toggle: avecPin }),
      avecPin ? ligneReglages('Verrouiller maintenant', null, { action: 'Verrouiller' }) : null,
      ligneReglages('Exporter mes données', 'Historique CSV · Bilan PDF', {}),
      ligneReglages('Sauvegarde & restauration', null, {}),
      ligneReglages('Confidentialité & conditions', 'Vos données restent chez vous', { action: 'Lire' }),
      ligneReglages('Supprimer mon compte', null, { danger: true, action: 'Supprimer' }),
    ]),
    titreSection('Support'),
    groupeReglages([
      ligneReglages('Aide & support', null, { action: 'Ouvrir' }),
      ligneReglages('Inviter des amis', null, { action: 'Partager' }),
      ligneReglages('Déconnexion', null, { danger: true }),
    ]),
    o.pied,
  ])
  return c
}

function piedVersion() {
  const p = rangee('Pied version', { l: LARGEUR, align: 'CENTER', fond: C.carte })
  p.appendChild(texte('Tontine Manager v2.3.8', { ta: 11, c: C.texteDoux, milieu: true }))
  return p
}

function e07Normal() {
  return cadre('Tontine/07-Réglages · normal', {
    entete: enteteTitre('Réglages', 'Aya Kouassi · 07 00 00 00 01'),
    contenu: sectionReglages({ pied: null }, true),
    pied: piedVersion(),
  })
}

function e07Vide() {
  return cadre('Tontine/07-Réglages · état vide', {
    entete: enteteTitre('Réglages', 'Aucun compte connecté · aucune tontine'),
    contenu: sectionReglages({ pied: null }, false),
    pied: piedVersion(),
  })
}

/* ────────────────────────────── 08 assistant ─────────────────────────── */

function pastilleSuggestion(libelle) {
  // rounded-full px-3 py-1.5 text-xs font-bold (AssistantScreen.jsx:271)
  const r = rangee('Suggestion', {
    rayon: RAYON_PILL, fond: C.brand500, alpha: 0.10, bord: C.brand500, alphaBord: 0.35,
    gap: 4, pad: [6, 12, 6, 12], align: 'MIN', valign: 'CENTER',
  })
  r.appendChild(texte(libelle, { ta: 12, gr: 'Bold', c: C.brand600 }))
  return r
}

function carteBienvenue(groupe) {
  // .card p-4 text-sm + mt-3 flex gap-2 (AssistantScreen.jsx:266-271)
  const c = pile('Carte bienvenue', {
    l: INTERNE, gap: 12, pad: [12, 12, 12, 12], fond: C.carte, alpha: 0.94, rayon: 24, ombre: true,
  })
  const corps = pile('Texte bienvenue', { l: INTERNE - 24, gap: 4 })
  corps.appendChild(texte('👋 Bonjour ! Je suis votre secrétaire, trésorier et analyste.', { ta: 14, gr: 'Bold', c: C.texte, l: INTERNE - 24 }))
  corps.appendChild(texte('Je connais les chiffres de votre tontine (collecte, retards, pénalités, trésorerie) et je vous conseille dessus. Je peux aussi agir : ajouter un membre, enregistrer un paiement, relancer, créer une tontine, générer un rapport…',
    { ta: 14, c: C.texteDim, l: INTERNE - 24, lignes: 4 }))
  c.appendChild(corps)
  const pills = pile('Suggestions', { l: INTERNE - 24, gap: 8, align: 'MIN' })
  ;(groupe
    ? ['Qui doit payer cette semaine ?', 'Qui n\'a pas encore payé ?', 'Score financier 68/100 : explique-le moi', 'Prépare la distribution du pot']
    : ['Comment créer ma première tontine ?']).forEach((s) => pills.appendChild(pastilleSuggestion(s)))
  c.appendChild(pills)
  return c
}

function bulleAssistant(o) {
  // max-w-[88%] → 288, avatar 28 + gap 8 → bulle 252 ; rounded-2xl px-3.5 py-2.5 text-sm
  // (AssistantScreen.jsx:358-362)
  const c = pile('Réponse assistant', { l: 252, gap: 8, pad: [10, 14, 10, 14], fond: C.carte, rayon: 16, bord: C.bord, ombre: true })
  c.appendChild(texte(o.chip, { ta: 11, gr: 'Bold', c: C.brand700 }))
  c.appendChild(texte(o.texte, { ta: 14, c: C.texteDim, l: 224, lignes: o.lignes || 3 }))
  const r = rangee('Actions assistant', { gap: 8, align: 'MIN' })
  o.boutons.forEach((b) => {
    if (b.fond === C.wave) {
      // #1F8A4C + blanc = 4,38:1 ; #1B7A44 relève à 5,37:1.
      r.appendChild(bouton(b.libelle, { fond: C.wave, ta: 12 }))
    } else if (b.fond === C.orange) {
      // #F47B20 + blanc = 2,73:1 ; texte #0F2A44 = 5,36:1.
      r.appendChild(bouton(b.libelle, { fond: C.orange, c: C.ocreTexte, ta: 12 }))
    } else {
      r.appendChild(bouton(b.libelle, { secondaire: true, ta: 12 }))
    }
  })
  c.appendChild(r)
  return c
}

function e08Normal() {
  const c = contenu('Contenu assistant', [
    carteBienvenue(true),
    bulleMoi('Qui n\'a pas encore payé ?', '11:20'),
    bulleAssistant({
      chip: 'Analyse de la collecte',
      texte: '2 cotisations sur 5 ont été reçues pour le tour #2. Ibrahim Bakayoko est en retard de 3 jours, la pénalité automatique est à 2 %/jour.',
      lignes: 4,
      boutons: [
        { libelle: 'Payer avec Wave', fond: C.wave },
        { libelle: 'Payer avec Orange Money', fond: C.orange },
        { libelle: 'Appeler Ibrahim', secondaire: true },
      ],
    }),
  ])
  return cadre('Tontine/08-Assistant · normal', {
    entete: enteteTitre('Assistant IA', GROUPE, { ta: 18 }),
    contenu: c,
    pied: composeur('Écrivez ou parlez à l\'assistant…'),
  })
}

function e08Vide() {
  const c = contenu('Contenu assistant vide', [
    carteBienvenue(false),
    (() => {
      const r = rangee('Assistant réfléchit', {
        l: INTERNE, gap: 8, align: 'CENTER', rayon: 18, fond: C.carte, bord: C.bord, valign: 'CENTER',
      })
      r.appendChild(figure('cercle', 6, C.brand600))
      r.appendChild(texte('l\'assistant réfléchit…', { ta: 13, c: C.texteDoux }))
      return r
    })(),
  ])
  return cadre('Tontine/08-Assistant · état vide', {
    entete: enteteTitre('Assistant IA', 'CarnetTontine', { ta: 18 }),
    contenu: c,
    pied: composeur('Écrivez ou parlez à l\'assistant…'),
  })
}

/* ───────────────────────────── assemblage ────────────────────────────── */

const ECRANS = [
  ['01-Accueil', e01Normal, e01Vide],
  ['02-Argent', e02Normal, e02Vide],
  ['03-Planning', e03Normal, e03Vide],
  ['04-Discussion', e04Normal, e04Vide],
  ['05-Épargne', e05Normal, e05Vide],
  ['06-Stats', e06Normal, e06Vide],
  ['07-Réglages', e07Normal, e07Vide],
  ['08-Assistant', e08Normal, e08Vide],
]

async function main() {
  await chargerPolices()
  const page = figma.currentPage
  page.name = 'Tontine · maquettes mobile-first'
  page.setPluginData('source', 'src/screens')

  const frames = []
  ECRANS.forEach(([nom, normal, vide], i) => {
    const a = normal()
    a.x = i * (LARGEUR + 40)
    a.y = 0
    page.appendChild(a)
    frames.push(a)
    const b = vide()
    b.x = i * (LARGEUR + 40)
    b.y = HAUTEUR + 80
    page.appendChild(b)
    frames.push(b)
  })

  figma.viewport.scrollAndZoomIntoView(frames)
  figma.notify(frames.length + ' maquettes générées')
  figma.closePlugin('Tontine · ' + frames.length + ' maquettes 360×800 générées sur la page « ' + page.name + ' »')
}

main().catch((e) => {
  figma.closePlugin('Échec : ' + (e && (e.stack || e.message) ? (e.stack || e.message) : String(e)))
})
