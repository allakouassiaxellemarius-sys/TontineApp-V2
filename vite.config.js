import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // `capacitor copy android` embarque tout le dossier dist dans l'APK : des
    // .map, même « hidden », gonfleraient le paquet et exposeraient la source.
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Sépare les bibliothèques lourdes du corps de l'app : le bundle
        // principal reste petit au démarrage et les libs ne sont téléchargées
        // que par l'écran qui en a besoin.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](jspdf|jspdf-autotable|html2canvas)[\\/]/.test(id)) return 'pdf'
          if (/[\\/]node_modules[\\/]xlsx[\\/]/.test(id)) return 'tableur'
          if (/[\\/]node_modules[\\/]@?firebase[\\/]/.test(id)) return 'firebase'
        },
      },
    },
  },
})
