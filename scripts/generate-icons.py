# -*- coding: utf-8 -*-
# Rastérise le monogramme « T » de `public/favicon.svg` dans toutes les icônes
# livrées (web, mipmaps Android, splash Android, assets iOS).
#
# Chaine de vérité : charte.js -> favicon.svg -> PNG. Les trois verts du dégradé
# et le liseré sont comparés à la charte avant tout écriture ; si le SVG a
# décroché, le script refuse de produire des icônes périmées.
# Aucun hex n'est écrit dans ce fichier.
#
# Usage : python scripts/generate-icons.py [--dry]

import json
import os
import re
import sys
from PIL import Image, ImageChops, ImageDraw

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG = os.path.join(RACINE, "public", "favicon.svg")
CHARTE = os.path.join(RACINE, "src", "lib", "charte.js")

RE_STOP = re.compile(r'offset="([0-9.]+)"[^>]*stop-color="(#[0-9A-Fa-f]{6})"')
RE_VECTOR = re.compile(r'<linearGradient[^>]*x1="([0-9.]+)"[^>]*y1="([0-9.]+)"[^>]*x2="([0-9.]+)"[^>]*y2="([0-9.]+)"')
RE_CHARTE_HEX = re.compile(r"^\s*(\w+):\s*'(#[0-9A-Fa-f]{6})'", re.M)
RE_CHARTE_RVB = re.compile(r"^\s*(\d+):\s*'(\d+) (\d+) (\d+)'", re.M)
RE_LISERE = re.compile(r'<rect x="([0-9.]+)" y="([0-9.]+)" width="([0-9.]+)" height="([0-9.]+)" rx="([0-9.]+)"[^>]*stroke="(#[0-9A-Fa-f]{6})"[^>]*stroke-width="([0-9.]+)"[^>]*opacity="([0-9.]+)"')
RE_PIECE = re.compile(r'<circle cx="([0-9.]+)" cy="([0-9.]+)" r="([0-9.]+)" fill="(#[0-9A-Fa-f]{6})" stroke="(#[0-9A-Fa-f]{6})"')
RE_BRILL = re.compile(r'<circle cx="([0-9.]+)" cy="([0-9.]+)" r="([0-9.]+)" fill="#[0-9A-Fa-f]{6}" opacity="([0-9.]+)"')
RE_TRAIT = re.compile(r'<path d="M([0-9]+) ([0-9]+) H([0-9]+)"|<path d="M([0-9]+) ([0-9]+) V([0-9]+)"')
RE_LARGEUR = re.compile(r'stroke-width="(6[0-9])"')

BLANC = (255, 255, 255)
_RES = getattr(Image, "Resampling", Image)
_NEAREST, _LANCZOS, _BICUBIC = _RES.NEAREST, _RES.LANCZOS, _RES.BICUBIC


def rgb(hex_str):
    h = hex_str.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def vers_hex(couleur):
    return "#%02x%02x%02x" % couleur


def lire_charte():
    texte = open(CHARTE, encoding="utf-8").read()
    bloc = texte.split("export const HEX", 1)[1].split("}", 1)[0]
    verts = {nom.lower(): rgb(h) for nom, h in RE_CHARTE_HEX.findall(bloc)}
    clair = texte.split("export const BRAND_CLAIR", 1)[1].split("}", 1)[0]
    brand = {int(cran): (int(r), int(g), int(b)) for cran, r, g, b in RE_CHARTE_RVB.findall(clair)}
    return verts, brand


def lire_svg():
    t = open(SVG, encoding="utf-8").read()
    stops = [(float(o), rgb(h)) for o, h in RE_STOP.findall(t)]
    vx = RE_VECTOR.search(t)
    vector = (float(vx.group(3)) - float(vx.group(1)), float(vx.group(4)) - float(vx.group(2))) if vx else (0.4, 1.0)
    li = RE_LISERE.search(t)
    piece = RE_PIECE.search(t)
    brill = RE_BRILL.search(t)
    traits = []
    for m in RE_TRAIT.finditer(t):
        if m.group(1):
            traits.append(((int(m.group(1)), int(m.group(2))), (int(m.group(3)), int(m.group(2)))))
        else:
            traits.append(((int(m.group(4)), int(m.group(5))), (int(m.group(4)), int(m.group(6)))))
    largeurs = [int(x) for x in RE_LARGEUR.findall(t)]
    plaque_rx = float(re.search(r'<rect width="512" height="512" rx="([0-9]+)"', t).group(1))
    if not (stops and li and piece and traits and len(traits) == 2):
        raise SystemExit("favicon.svg : géométrie incomplète (arrêts=%d liseré=%s pièce=%s traits=%d)"
                         % (len(stops), bool(li), bool(piece), len(traits)))
    return {
        "stops": stops, "vector": vector, "plaque_rx": plaque_rx,
        "lisere": (float(li.group(1)), float(li.group(2)), float(li.group(3)), float(li.group(4)),
                   float(li.group(5)), rgb(li.group(6)), float(li.group(7)), float(li.group(8))),
        "piece": (float(piece.group(1)), float(piece.group(2)), float(piece.group(3)),
                  rgb(piece.group(4)), rgb(piece.group(5))),
        "brillance": (float(brill.group(3)), float(brill.group(4))) if brill else (15.0, 0.6),
        "traits": traits, "largeur": largeurs[0] if largeurs else 66,
    }


def controle():
    verts, brand = lire_charte()
    svg = lire_svg()
    attendus = [verts["vertclair"], verts["vert"], verts["vertfonce"]]
    obtenus = [c for _, c in svg["stops"]]
    if obtenus != attendus:
        raise SystemExit("favicon.svg n'est plus la charte : %s (attendu %s)"
                         % ([vers_hex(c) for c in obtenus], [vers_hex(c) for c in attendus]))
    if svg["lisere"][5] != brand.get(700):
        raise SystemExit("liseré du SVG %s != BRAND_CLAIR[700] %s"
                         % (vers_hex(svg["lisere"][5]), vers_hex(brand.get(700, (0, 0, 0)))))
    return svg


def rampe(stops):
    canaux = [[0] * 256 for _ in range(3)]
    pts = [(p * 255.0, c) for p, c in stops]
    for i in range(256):
        if i <= pts[0][0]:
            couleur = pts[0][1]
        elif i >= pts[-1][0]:
            couleur = pts[-1][1]
        else:
            for (a, ca), (b, cb) in zip(pts, pts[1:]):
                if a <= i <= b:
                    t = (i - a) / (b - a) if b > a else 0.0
                    couleur = tuple(int(round(ca[k] + (cb[k] - ca[k]) * t)) for k in range(3))
                    break
        for k in range(3):
            canaux[k][i] = couleur[k]
    return canaux


def gradient(n, svg, w=None, h=None):
    """Dégradé linéaire diagonal (sans numpy) : `n` px de côté, sortie (w,h)."""
    w = w or n
    h = h or n
    wx, wy = abs(svg["vector"][0]), abs(svg["vector"][1])
    if wx + wy == 0:
        wx, wy = 0.0, 1.0
    fx, fy = wx / (wx + wy), wy / (wx + wy)
    pas = [255.0 * i / (n - 1) for i in range(n)] if n > 1 else [255.0]
    sx = Image.new("L", (n, 1))
    sx.putdata([int(min(255, v * fx)) for v in pas])
    sy = Image.new("L", (1, n))
    sy.putdata([int(min(255, v * fy)) for v in pas])
    t = ImageChops.add(sx.resize((n, n), _NEAREST), sy.resize((n, n), _NEAREST))
    if (w, h) != (n, n):
        t = t.resize((w, h), _BICUBIC)
    canaux = rampe(svg["stops"])
    return Image.merge("RGB", [tt.point(cc) for tt, cc in zip((t, t, t), canaux)]).convert("RGBA")


def masque_forme(n, forme, rx):
    m = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(m)
    if forme == "cercle":
        e = int(n * 0.02)
        d.ellipse([e, e, n - e, n - e], fill=255)
    elif forme == "carré":
        d.rectangle([0, 0, n - 1, n - 1], fill=255)
    else:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * rx / 512.0, fill=255)
    return m


def trait_arrondi(d, a, b, largeur, couleur, k):
    d.line([a[0] * k, a[1] * k, b[0] * k, b[1] * k], fill=couleur, width=max(1, int(round(largeur * k))))
    r = largeur * k / 2.0
    for pt in (a, b):
        d.ellipse([pt[0] * k - r, pt[1] * k - r, pt[0] * k + r, pt[1] * k + r], fill=couleur)


def dessine_marque(n, svg):
    """Monogramme + pièce dans l'espace 512 mis à l'échelle `n`, canvas transparent."""
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = n / 512.0
    for (a, b) in svg["traits"]:
        trait_arrondi(d, a, b, svg["largeur"], BLANC + (255,), k)
    cx, cy, cr, remplissage, contour = svg["piece"]
    r = cr * k
    largeur = 10.0 * k / 2.0
    d.ellipse([cx * k - r - largeur, cy * k - r - largeur, cx * k + r + largeur, cy * k + r + largeur],
              fill=contour + (255,))
    d.ellipse([cx * k - r + largeur, cy * k - r + largeur, cx * k + r - largeur, cy * k + r - largeur],
              fill=remplissage + (255,))
    raybr, op = svg["brillance"]
    o = raybr * k
    d.ellipse([cx * k - o, cy * k - o, cx * k + o, cy * k + o],
              fill=BLANC + (int(round(255 * op)),))
    return img


def dessine_lisere(n, svg, forme="arrondi", masque=None):
    x, y, w, h, rx, couleur, lw, alpha = svg["lisere"]
    couche = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(couche)
    k = n / 512.0
    if forme == "cercle":
        # Sur une pastille circulaire, le liseré suit le cercle : un rectangle
        # arrondi dépasserait du disque et laisserait des coins fantômes.
        inset = x * k
        d.ellipse([inset, inset, n - inset - 1, n - inset - 1],
                  outline=couleur + (int(round(255 * alpha)),), width=max(1, int(round(lw * k))))
    else:
        d.rounded_rectangle([x * k, y * k, (x + w) * k - 1, (y + h) * k - 1], radius=rx * k,
                            outline=couleur + (int(round(255 * alpha)),), width=max(1, int(round(lw * k))))
    if masque is not None:
        couche.putalpha(ImageChops.multiply(couche.split()[3], masque))
    return couche


def collage_centre(base, art, cote):
    bx = art.getbbox()
    if not bx:
        return base
    motif = art.crop(bx)
    ratio = motif.size[1] / float(motif.size[0])
    w = int(round(cote))
    h = int(round(cote * ratio))
    motif = motif.resize((w, h), _LANCZOS)
    base.alpha_composite(motif, ((base.size[0] - w) // 2, (base.size[1] - h) // 2))
    return base


def rendu_plate(n_out, svg, forme, ss, marge_marque=None):
    n = n_out * ss
    fond = gradient(n, svg)
    masque = masque_forme(n, forme, svg["plaque_rx"])
    fond.putalpha(masque)
    base = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    base = Image.alpha_composite(base, fond)
    if forme != "carré":
        base = Image.alpha_composite(base, dessine_lisere(n, svg, forme, masque))
    marque = dessine_marque(n, svg)
    if marge_marque is None:
        base = Image.alpha_composite(base, marque)
    else:
        base = collage_centre(base, marque, n * marge_marque)
    return base.resize((n_out, n_out), _LANCZOS) if ss > 1 else base


def rendu_fg(n_out, svg, ss, marge):
    n = n_out * ss
    base = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    base = collage_centre(base, dessine_marque(n, svg), n * marge)
    return base.resize((n_out, n_out), _LANCZOS) if ss > 1 else base


def rendu_splash(taille, svg):
    w, h = taille
    ss = 1 if min(w, h) >= 512 else 2
    # Le splash montre la pastille complète (SVG `splash_logo` natif idem) :
    # un T blanc seul flotterait sur le fond noir sans rappeler la marque.
    cote_logo = int(min(w, h) * 0.34 * ss)
    logo = rendu_plate(cote_logo, svg, "arrondi", 1)
    fond = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
    fond.alpha_composite(logo, ((w * ss - cote_logo) // 2, (h * ss - cote_logo) // 2))
    return fond.resize((w, h), _LANCZOS) if ss > 1 else fond


def rendu_plat(taille, svg):
    w, h = taille
    n = max(w, h)
    fond = gradient(n, svg, w, h)
    fond.putalpha(Image.new("L", (w, h), 255))
    return fond


def taille_existante(chemin):
    with Image.open(chemin) as im:
        return im.size


def ss_pour(taille):
    return 1 if taille >= 1024 else (2 if taille >= 256 else 3)


def lister_cibles():
    res = os.path.join(RACINE, "android", "app", "src", "main", "res")
    cibles = []
    for nom, taille in (("favicon.png", 64), ("logo-192.png", 192), ("logo-512.png", 512)):
        cibles.append([os.path.join(RACINE, "public", nom), (taille, taille), "plate", {}])
    ios_pub = os.path.join(RACINE, "ios", "App", "App", "public", "favicon.png")
    if os.path.exists(ios_pub):
        cibles.append([ios_pub, taille_existante(ios_pub), "plate", {}])
    for densite in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"):
        dossier = os.path.join(res, "mipmap-" + densite)
        if not os.path.isdir(dossier):
            continue
        for nom, variante in (("ic_launcher.png", "plate"), ("ic_launcher_round.png", "round")):
            chemin = os.path.join(dossier, nom)
            if os.path.exists(chemin):
                cibles.append([chemin, taille_existante(chemin), variante, {}])
        fg = os.path.join(dossier, "ic_launcher_foreground.png")
        if os.path.exists(fg):
            cibles.append([fg, taille_existante(fg), "fg", {"marge": 0.42}])
    for sous in sorted(os.listdir(res)):
        if sous.startswith("drawable"):
            sp = os.path.join(res, sous, "splash.png")
            if os.path.exists(sp):
                cibles.append([sp, taille_existante(sp), "splash", {}])
    appicon = os.path.join(RACINE, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png")
    if os.path.exists(appicon):
        cibles.append([appicon, taille_existante(appicon), "ios", {"marge": 0.62}])
    splash_dir = os.path.join(RACINE, "ios", "App", "App", "Assets.xcassets", "Splash.imageset")
    if os.path.isdir(splash_dir):
        for f in sorted(os.listdir(splash_dir)):
            if f.endswith(".png"):
                chemin = os.path.join(splash_dir, f)
                cibles.append([chemin, taille_existante(chemin), "plat", {}])
    return cibles


def produire(chemin, taille, variante, svg, kwargs):
    if variante == "splash":
        return rendu_splash(taille, svg)
    if variante == "plat":
        return rendu_plat(taille, svg)
    n_out = taille[0]
    ss = ss_pour(n_out)
    if variante == "plate":
        return rendu_plate(n_out, svg, "arrondi", ss)
    if variante == "round":
        return rendu_plate(n_out, svg, "cercle", ss)
    if variante == "ios":
        return rendu_plate(n_out, svg, "carré", ss, marge_marque=kwargs["marge"])
    if variante == "fg":
        return rendu_fg(n_out, svg, ss, kwargs["marge"])
    raise SystemExit("variante inconnue : " + variante)


def main():
    sec = "--dry" in sys.argv
    svg = controle()
    lignes = []
    for chemin, taille, variante, kwargs in lister_cibles():
        relatif = chemin.replace(RACINE + os.sep, "/").replace("\\", "/")
        if sec:
            lignes.append("%-78s %5dx%-6d %s" % (relatif, taille[0], taille[1], variante))
            continue
        image = produire(chemin, taille, variante, svg, kwargs)
        image.save(chemin, "PNG")
        lignes.append("%-78s %5dx%-6d %s" % (relatif, image.size[0], image.size[1], variante))
    print("\n".join(lignes))
    print(json.dumps({"ecrits": 0 if sec else len(lignes),
                      "chaine": [vers_hex(c) for _, c in svg["stops"]],
                      "lisere": vers_hex(svg["lisere"][5]),
                      "piece": vers_hex(svg["piece"][3]) + "/" + vers_hex(svg["piece"][4])},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
