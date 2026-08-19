import { useState } from 'react'
import { UserPlus, ClipboardPaste } from 'lucide-react'
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

export default function ImportContactsModal({ group, onClose, onDone }) {
  const toast = useToast()
  const [methode, setMethode] = useState(null) // 'repertoire' | 'coller' | 'apercu'
  const [texte, setTexte] = useState('')
  const [contacts, setContacts] = useState([])
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState(null)

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
      if (!navigator.contacts || !navigator.contacts.select) throw new Error('unsupported')
      const res = await navigator.contacts.select(['name', 'tel'], { multiple: true })
      const liste = (res || [])
        .map((c) => ({ nom: (c.name && c.name[0]) || '', telephone: (c.tel && c.tel[0]) || '' }))
        .filter((c) => c.nom || c.telephone)
      if (!liste.length) {
        setErreur('Aucun contact sélectionné.')
        return
      }
      appliquerListe(liste)
    } catch (e) {
      setErreur("L'accès au répertoire n'est pas disponible sur cette connexion. Utilisez « Coller une liste ».")
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
          <button className="btn btn-primary w-full !py-4 text-base" onClick={ouvrirRepertoire} disabled={chargement}>
            <UserPlus size={20} /> {chargement ? 'Chargement…' : 'Depuis le répertoire téléphonique'}
          </button>
          <button className="btn btn-secondary w-full !py-4 text-base" onClick={() => setMethode('coller')}>
            <ClipboardPaste size={20} /> Coller une liste
          </button>
          {erreur && <p className="rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger-600">{erreur}</p>}
          <p className="text-center text-[11px] text-gray-400">
            Le répertoire utilise l'API Contacts (Android/Chrome). Sinon, collez votre liste.
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
