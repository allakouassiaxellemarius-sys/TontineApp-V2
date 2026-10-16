#!/usr/bin/env python3
"""Empaquette dist/ en zip OTA conforme a @capgo/capacitor-updater.

Usage : python scripts/pack-ota.py <dossier_src> <zip_sortie>

Ecrit le zip avec deflate (methode 8) et des separateurs « / », puis relit les
entetes locaux octet par octet pour le prouver. ZipFile normalise
silencieusement les noms en « / » : seule la lecture des octets est une preuve.
Sort en 1 si le zip n'est pas livrable, donc un appelant PowerShell qui
verifie $LASTEXITCODE ne peut pas publier un bundle que le telephone refusait.

Pourquoi pas Compress-Archive / ZipFile.CreateFromDirectory : ils écrivent
« assets\\index.js », et le plugin Android rejette l'archive avec
« Unzip failed: Windows path not supported » — la mise a jour ne s'installe
jamais, sans que rien n'avertisse cote app.

Pourquoi pas `tar -a -c -f x.zip` : mesuré sur le même dist, bsdtar produit 61
entrées dont 3 répertoires en méthode 0, avec tous les noms préfixés « ./ »,
tandis que le bundle livré en compte 58 en méthode 8 sans préfixe. Et selon le
`tar` situé en premier dans le PATH, ce n'est plus le même binaire : le
GNU tar de Git for Windows ne connaît pas le format zip et échoue sur les
chemins Windows (« Cannot connect to C: resolve failed »). Le résultat dépend
donc de l'endroit d'où la commande est lancée.
"""

import hashlib
import os
import struct
import sys
import zipfile

SIGNATURE_ENTREE_LOCALE = b"PK\x03\x04"
METHODE_DEFLATE = 8


def entrees(src):
    fichiers = []
    for racine, dossiers, noms in os.walk(src):
        dossiers.sort()
        for n in sorted(noms):
            full = os.path.join(racine, n)
            rel = os.path.relpath(full, src).replace(os.sep, "/")
            fichiers.append((full, rel))
    fichiers.sort(key=lambda p: p[1])
    return fichiers


def lire_en_tetes_locaux(chemin):
    """Retourne [(nom, methode)] en lisant l'octet stream, sans ZipFile."""
    brut = open(chemin, "rb").read()
    entrees_vues = []
    i = 0
    while True:
        i = brut.find(SIGNATURE_ENTREE_LOCALE, i)
        if i < 0:
            break
        methode = struct.unpack_from("<H", brut, i + 8)[0]
        nom_len = struct.unpack_from("<H", brut, i + 26)[0]
        extra_len = struct.unpack_from("<H", brut, i + 28)[0]
        nom = brut[i + 30 : i + 30 + nom_len].decode("utf-8")
        entrees_vues.append((nom, methode))
        i += 30 + nom_len + extra_len
    return brut, entrees_vues


def controler(src, chemin, fichiers, entrees_vues):
    anomalies = []
    brut, _ = lire_en_tetes_locaux(chemin)
    methodes = sorted({m for _, m in entrees_vues})
    noms = [n for n, _ in entrees_vues]

    if len(entrees_vues) != len(fichiers):
        anomalies.append(f"{len(entrees_vues)} entrees pour {len(fichiers)} fichiers")
    if methodes != [METHODE_DEFLATE]:
        anomalies.append(f"methodees {methodes} (attendu [{METHODE_DEFLATE}] = deflate)")
    if any("\\" in n for n in noms):
        anomalies.append("separateurs Windows dans les noms")
    if any(n.startswith("./") for n in noms):
        anomalies.append("entrees prefixeuses « ./ »")
    if "index.html" not in noms:
        anomalies.append("index.html absent de la racine")

    z = zipfile.ZipFile(chemin)
    par_nom = {n: m for n, m in entrees_vues}
    for full, rel in fichiers:
        if par_nom.get(rel) != METHODE_DEFLATE:
            anomalies.append(f"{rel} : methode {par_nom.get(rel)}")
            continue
        if hashlib.sha256(z.read(rel)).hexdigest() != hashlib.sha256(
            open(full, "rb").read()
        ).hexdigest():
            anomalies.append(f"{rel} : contenu different")
    if z.testzip() is not None:
        anomalies.append("CRC invalide")
    del brut
    return anomalies


def main(argv):
    if len(argv) != 3:
        print(__doc__)
        return 2
    src, out = os.path.abspath(argv[1]), os.path.abspath(argv[2])
    if not os.path.isdir(src):
        print(f"Source introuvable : {src}")
        return 2
    fichiers = entrees(src)
    if not fichiers:
        print(f"Source vide : {src} (le zip vide sera refuse par l'appareil)")
        return 1

    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(
        out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as z:
        for full, rel in fichiers:
            z.write(full, rel)

    _, entrees_vues = lire_en_tetes_locaux(out)
    anomalies = controler(src, out, fichiers, entrees_vues)
    print(f"entrees: {len(entrees_vues)}  fichiers source: {len(fichiers)}")
    print(f"index.html racine: {'index.html' in [n for n, _ in entrees_vues]}")
    print(f"taille zip: {os.path.getsize(out)} octets")
    print(f"sha256 zip: {hashlib.sha256(open(out, 'rb').read()).hexdigest()}")
    if anomalies:
        print(f"ANOMALIES ({len(anomalies)}): {anomalies[:5]}")
        return 1
    print("zip conforme : deflate, separateurs « / », index.html a la racine")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
