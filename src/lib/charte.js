// Charte « Accueil.pdf » (9 novembre 2026) — source de vérité unique.
// Ces repères venaient d'être recopiés écran par écran : ils vivent ici, et
// `src/index.css` (qui ne peut pas importer du JS) en reprend les triplets RVB
// en littéraux. Le harnais `repack/simulation-globale.mjs` compare les deux,
// c'est ce qui empêche l'accueil et le reste de l'app de redevoir diverger.

export const HEX = {
  creme: '#F5F4EF',        // fond de page
  vert: '#0D7A50',         // carte solde, bouton « Payer », barre remplie, primaire
  vertPale: '#318D68',     // tuiles de la carte solde
  vertLien: '#17754F',     // « Tout voir »
  vertLabel: '#D9F6E6',    // libellé et devise sur vert
  vertTile: '#C5F5DF',     // libellé sur tuile
  vertClair: '#86C7A8',    // tint lisible sur fond sombre
  vertDoux: '#4FA982',     // tint intermédiaire
  vertFonce: '#084C34',    // borne basse des dégradés et des ombres portées
  ambre: '#FBE9D1',
  ambreEncre: '#6A3808',
  orange: '#E8892C',       // FAB
  orangeEncre: '#241705',
  encre: '#18281D',        // « Bonjour », corps de texte
  encreTitre: '#1A291E',
  encreDouce: '#626961',   // dates, icones, liens discrets
  encreCarte: '#1C2721',   // titres et compteurs des cartes blanches
  encreForte: '#182621',   // ligne forte de la carte d'échéance
  grisCarte: '#5F6A66',    // secondaires sur blanc
  grisLeger: '#98A09B',
  blanc: '#FFFFFF',
  lisere: '#E5E2D9',       // contour des cartes blanches
  piste: '#E3E8E2',        // barre de progression non remplie
  avaFond: '#DDF1E5',
  avaEncre: '#16573B',
}

// Les variables de l'app sont des triplets RVB nus : `rgb(var(--brand-600) / <alpha-value>)`.
export const versRVB = (hex) => {
  const h = String(hex).replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

export const R = Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, versRVB(v)]))

export const BRAND_CLAIR = {
  50: R.blanc,
  100: R.vertLabel,
  200: R.vertTile,
  300: R.vertClair,
  400: R.vertDoux,
  500: R.vertPale,
  600: R.vert,
  700: '10 97 65',
  800: R.vertFonce,
  900: '6 58 40',
}

// Le mode sombre miroite les *tints* (les fonds et les textes secondaires),
// jamais la surface primaire : `bg-brand-600` + texte blanc reste #0D7A50 des
// deux côtés, sinon le blanc retombe sous 4,5:1 (défaut #82).
export const BRAND_SOMBRE = {
  50: '10 23 16',
  100: '14 32 24',
  200: '22 48 34',
  300: '30 64 45',
  400: R.vertDoux,
  500: R.vertClair,
  600: R.vert,
  700: '154 214 183',
  800: R.vertTile,
  900: R.vertLabel,
}

// Contrats de `lib/theme.js` : les clés attendues par `appliquerPalette`.
export const PALETTE_CLAIR = {
  bg: R.creme,
  bgCard: R.blanc,
  border: R.lisere,
  borderSubtle: '232 230 222',
  accent: R.vert,
  accentLight: '8 76 52',
  text: R.encre,
  textDim: R.encreDouce,
  textMuted: R.grisCarte,
  success: R.vert,
  error: '198 40 40',
}

export const PALETTE_SOMBRE = {
  bg: '10 18 13',
  bgCard: '16 28 21',
  border: '34 58 44',
  borderSubtle: '26 46 35',
  accent: R.vertClair,
  accentLight: '154 214 183',
  text: '232 240 233',
  textDim: '176 190 180',
  textMuted: '150 166 155',
  success: R.vertClair,
  error: '229 90 90',
  meta: { hue: 'Tontine · Nuit', icon: '🌙' },
}
