import { useRef, useState } from 'react'
import { Download, Upload, AlertTriangle, FileSpreadsheet } from 'lucide-react'
import SectionCard from './SectionCard'
import ActionRow from './ActionRow'
import Modal from '../Modal'
import { exporterSauvegarde, validerSauvegarde, appliquerSauvegarde, lireFichier } from '../../lib/sauvegarde'
import { exporterToutesTontinesExcel } from '../../lib/excel'

export default function SettingsSauvegarde({ refresh }) {
  const fichierRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgErreur, setMsgErreur] = useState(false)
  const [preview, setPreview] = useState(null) // { texte, detail }
  const [confirmOpen, setConfirmOpen] = useState(false)

  const flash = (texte, erreur) => {
    setMsg(texte)
    setMsgErreur(!!erreur)
    setTimeout(() => setMsg(''), 5000)
  }

  const surExporter = async () => {
    if (busy) return
    setBusy(true)
    try {
      await exporterSauvegarde()
      flash('Sauvegarde exportée ✓ (fichier JSON partagé/enregistré).')
    } catch (e) {
      flash("Échec de l'export : " + ((e && e.message) || 'erreur inconnue'), true)
    }
    setBusy(false)
  }

  const surExporterExcel = async () => {
    if (busy) return
    setBusy(true)
    try {
      await exporterToutesTontinesExcel()
      flash('Excel global exporté ✓ (une feuille par tontine).')
    } catch (e) {
      flash("Échec de l'export Excel : " + ((e && e.message) || 'erreur inconnue'), true)
    }
    setBusy(false)
  }

  const surFichierChoisi = async (e) => {
    const fichier = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!fichier) return
    try {
      const texte = await lireFichier(fichier)
      const v = validerSauvegarde(texte)
      if (!v.ok) {
        flash(v.raison, true)
        return
      }
      let detail = 'Sauvegarde valide. '
      for (const cle of ['groups', 'membres', 'tours', 'cotisations', 'epargnes']) {
        const n = (v.data[cle] || []).length
        detail += `${cle} : ${n} — `
      }
      setPreview({ texte, detail })
      setConfirmOpen(true)
    } catch (err) {
      flash("Lecture du fichier impossible : " + ((err && err.message) || 'erreur inconnue'), true)
    }
  }

  const confirmerImport = () => {
    setConfirmOpen(false)
    if (!preview) return
    const r = appliquerSauvegarde(preview.texte)
    setPreview(null)
    if (!r.ok) {
      flash(r.raison, true)
      return
    }
    flash(r.detail || 'Import terminé ✓')
    if (refresh) refresh()
  }

  return (
    <SectionCard icon={Download} title="Sauvegarde locale">
      <p className="mb-3 text-xs text-gray-400">
        Exporte toutes vos données (groupes, membres, tours, cotisations, prêts, épargnes, paramètres) dans un fichier JSON.
        L'import <strong>remplace</strong> les données actuelles de cet appareil. Le code PIN et la 2FA sont réinitialisés.
      </p>
      <div className="space-y-2">
        <ActionRow title="Exporter les données" subtitle="Génère un fichier JSON à partager ou conserver">
          <button className="btn btn-primary !py-2 text-xs" onClick={surExporter} disabled={busy}>
            <Download size={14} /> {busy ? '…' : 'Exporter'}
          </button>
        </ActionRow>
        <ActionRow title="Exporter Excel (toutes les tontines)" subtitle="Un classeur .xlsx avec une feuille par tontine">
          <button className="btn btn-secondary !py-2 text-xs" onClick={surExporterExcel} disabled={busy}>
            <FileSpreadsheet size={14} /> {busy ? '…' : 'Excel global'}
          </button>
        </ActionRow>
        <ActionRow title="Importer une sauvegarde" subtitle="Restaure depuis un fichier JSON">
          <button className="btn btn-secondary !py-2 text-xs" onClick={() => fichierRef.current && fichierRef.current.click()} disabled={busy}>
            <Upload size={14} /> Importer
          </button>
        </ActionRow>
      </div>
      <input ref={fichierRef} type="file" accept=".json,application/json" className="hidden" onChange={surFichierChoisi} />

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Importer cette sauvegarde ?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setConfirmOpen(false); setPreview(null); }}>Annuler</button>
            <button className="btn btn-primary" onClick={confirmerImport}>
              <AlertTriangle size={15} /> Remplacer les données
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">{preview ? preview.detail : ''}</p>
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-danger-50 p-3 text-xs text-danger-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Les données actuelles de cet appareil seront remplacées. Pensez à exporter d'abord une sauvegarde actuelle.
        </p>
      </Modal>

      {msg && (
        <p className={`mt-3 text-center text-xs font-semibold ${msgErreur ? 'text-danger-600' : 'text-success-600'}`}>{msg}</p>
      )}
    </SectionCard>
  )
}
