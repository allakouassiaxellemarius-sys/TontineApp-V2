import { useRef, useState } from 'react'
import { UserPlus, ClipboardPaste, FileUp } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { haptic } from '../lib/haptique'
import { addMembre, doublonMembre } from '../lib/db'
import Avatar from './Avatar'
import Modal from './Modal'

// Extrait un nom + un numéro à partir d'une ligne libre.
// Gère « Nom, 0707000000 », « Aya Kouassi 07 07 00 00 00 », ou un simple numéro.
function parseLigne(ligne) {
  const match = ligne.match(/(?:\+?\d[\d\s.\-]{5,}\d)/)
  if (match) {
    const telephone = match[0].trim()
    const nom = ligne
      .replace(match[0], '')
      .replace(/[,;\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return { nom: nom || telephone, telephone }
  }
  return { nom: ligne.trim(), telephone: '' }
}

function parseListe(texte) {
  return (texte || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseLigne)
    .filter((c) => c.nom)
}

// vCard 3.0/4.0 : un bloc BEGIN:VCARD…END:VCARD par contact. Les fabricants
// écrivent le numéro tantôt en international (+225…), tantôt en local, et
// placent le nom dans FN ou dans N (pseudonyme;prénom;;).
export function parseVCF(texte) {
  // Une ligne qui commence par un espace ou une tabulation prolonge la
  // précédente (repli RFC 6350) — sans cela les numéros longs sont tronqués.
  const deplie = (texte || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
  const contacts = []
  let courant = null
  for (const ligneBrute of deplie.split('\n')) {
    const l = ligneBrute.trim()
    if (/^BEGIN:VCARD/i.test(l)) { courant = { nom: '', telephone: '' }; continue }
    if (!courant) continue
    if (/^END:VCARD/i.test(l)) {
      if (courant.nom || courant.telephone) contacts.push(courant)
      courant = null
      continue
    }
    const i = l.indexOf(':')
    if (i === -1) continue
    const cle = l.slice(0, i).split(';')[0].toUpperCase()
    const val = l.slice(i + 1).trim()
    if (!val) continue
    if (cle === 'FN' && !courant.nom) courant.nom = val
    else if (cle === 'N' && !courant.nom) {
      const [pseudo, prenom] = val.split(';')
      courant.nom = [prenom, pseudo].filter(Boolean).join(' ').trim()
    } else if (cle === 'TEL' && !courant.telephone) courant.telephone = val
  }
  return contacts.map((c) => ({ nom: c.nom || c.telephone, telephone: c.telephone }))
}

// Le sélecteur natif de contacts (Contact Picker API) n'est exposé ni par la
// WebView Android ni par iOS : le proposer en permanence revient à afficher un
// bouton qui échoue toujours. On ne l'affiche que là où il existe.
const supporteSelecteur =
  typeof navigator !== 'undefined' && !!(navigator.contacts && navigator.contacts.select)

export default function ImportContactsModal({ group, onClose, onDone }) {
  const toast = useToast()
  const [methode, setMethode] = useState(null) // 'coller' | 'apercu'
  const [texte, setTexte] = useState('')
  const [contacts, setContacts] = useState([])
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState(null)
  const inputFichier = useRef(null)

  const appliquerListe = (liste) => {
    setContacts(
      liste.map((c) => ({
        nom: (c.nom || '').trim(),
        telephone: (c.telephone || '').trim(),
        selected: true,
        doublon: !!doublonMembre(group.id, c),
      }))
    )
    setMethode('apercu')
    setErreur(null)
  }

  const ouvrirRepertoire = async () => {
    setErreur(null)
    setChargement(true)
    try {
      const res = await navigator.contacts.select(['name', 'tel'], { multiple: true })
      const liste = (res || [])
        .map((c) => ({ nom: (c.name && c.name[0]) || '', telephone: (c.tel && c.tel[0]) || '' }))
        .filter((c) => c.nom || c.telephone)
      if (!liste.length) {
        setErreur('Aucun contact sélectionné.')
        return
      }
      appliquerListe(liste)
    } catch {
      setErreur('Sélection annulée ou refusée.')
    } finally {
      setChargement(false)
    }
  }

  // Export .vcf depuis l'app Contacts du téléphone (Contacts → Préférences →
  // Exporter) : le sélecteur de fichiers Android ouvre la galerie/le stockage,
  // et la lecture se fait entièrement en local, sans permission ni réseau.
  const surFichier = async (e) => {
    const fichiers = Array.from((e.target && e.target.files) || [])
    if (e.target) e.target.value = ''
    if (!fichiers.length) return
    setChargement(true)
    setErreur(null)
    try {
      const textes = await Promise.all(fichiers.map((f) => f.text()))
      const liste = textes.flatMap(parseVCF).filter((c) => c.nom || c.telephone)
      if (!liste.length) {
        setErreur('Aucun contact lisible dans ce fichier. Exporte tes contacts au format .vcf.')
        return
      }
      appliquerListe(liste)
    } catch {
      setErreur('Lecture du fichier impossible.')
    } finally {
      setChargement(false)
    }
  }

  const parserColler = () => {
    const liste = parseListe(texte)
    if (!liste.length) {
      setErreur('Aucun contact trouvé. Une ligne par contact : « Nom, téléphone ».')
      return
    }
    appliquerListe(liste)
  }

  const ajouter = () => {
    const choisis = contacts.filter((c) => c.selected && !c.doublon)
    let ajoutes = 0
    choisis.forEach((c) => {
      const m = addMembre(group.id, { nom: c.nom, telephone: c.telephone })
      if (m) ajoutes++
    })
    const ignores = contacts.filter((c) => c.doublon && c.selected).length
    if (ajoutes === 0 && choisis.length > 0) {
      toast.error('Ajout impossible (limite atteinte ou hors ligne)')
      return
    }
    toast.success(
      `${ajoutes} contact(s) ajouté(s)${ignores ? `, ${ignores} déjà présent(s)` : ''}`
    )
    haptic.success()
    if (onDone) onDone()
    onClose()
  }

  const aAjouter = contacts.filter((c) => c.selected && !c.doublon).length

  return (
    <Modal
      open
      onClose={onClose}
      title="Importer des contacts"
      footer={
        methode === 'apercu' ? (
          <>
            <button className="btn btn-secondary" onClick={() => { setMethode(null); setContacts([]); setTexte('') }}>
              Retour
            </button>
            <button className="btn btn-primary" onClick={ajouter} disabled={aAjouter === 0}>
              Ajouter {aAjouter} contact{aAjouter > 1 ? 's' : ''}
            </button>
          </>
        ) : (
          <button className="btn btn-secondary w-full" onClick={onClose}>
            Fermer
          </button>
        )
      }
    >
      {!methode && (
        <div className="flex flex-col gap-3">
          {supporteSelecteur && (
            <button className="btn btn-primary w-full !py-4 text-base" onClick={ouvrirRepertoire} disabled={chargement}>
              <UserPlus size={20} /> {chargement ? 'Chargement…' : 'Depuis le répertoire téléphonique'}
            </button>
          )}
          <button
            className={`btn w-full !py-4 text-base ${supporteSelecteur ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => inputFichier.current && inputFichier.current.click()}
            disabled={chargement}
          >
            <FileUp size={20} /> {chargement ? 'Lecture…' : 'Fichier de contacts (.vcf)'}
          </button>
          <button className="btn btn-secondary w-full !py-4 text-base" onClick={() => setMethode('coller')}>
            <ClipboardPaste size={20} /> Coller une liste
          </button>
          <input
            ref={inputFichier}
            type="file"
            accept=".vcf,text/vcard,text/x-vcard,text/plain"
            multiple
            className="hidden"
            onChange={surFichier}
          />
          {erreur && <p className="rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger-600">{erreur}</p>}
          <p className="text-center text-[11px] text-gray-400">
            Pour le .vcf : app Contacts → Paramètres → Exporter, puis choisis le fichier ici. Rien ne quitte ton téléphone.
          </p>
        </div>
      )}

      {methode === 'coller' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            Une ligne par contact. Ex. : <span className="font-mono">Aya Kouassi, 07 07 00 00 00</span>
          </p>
          <textarea
            className="input h-40 w-full resize-none"
            autoCapitalize="sentences"
            spellCheck={false}
            placeholder={'Aya Kouassi, 0707000000\nKofi Mensah, 0501234567'}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
          />
          <button className="btn btn-primary w-full" onClick={parserColler}>
            Analyser la liste
          </button>
          {erreur && <p className="rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger-600">{erreur}</p>}
        </div>
      )}

      {methode === 'apercu' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">
            <span className="font-semibold text-success-600">{contacts.filter((c) => !c.doublon).length} nouveau(x)</span>
            {' · '}
            <span className="text-gray-400">{contacts.filter((c) => c.doublon).length} déjà présent(s)</span>
          </p>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {contacts.map((c, i) => (
              <label
                key={i}
                className={`flex items-center gap-3 rounded-xl px-2 py-2 ${c.doublon ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}`}
              >
                <input
                  type="checkbox"
                  checked={c.selected}
                  disabled={c.doublon}
                  onChange={() => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, selected: !x.selected } : x)))}
                />
                <Avatar nom={c.nom} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800">{c.nom}</p>
                  <p className="truncate text-xs text-gray-400">{c.telephone || 'Pas de numéro'}</p>
                </div>
                {c.doublon && <span className="badge bg-gray-100 text-gray-400">Déjà là</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
