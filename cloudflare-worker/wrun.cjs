// Lance wrangler sous Electron-as-node.
// Yargs détecte mal argv quand le binaire n'est pas un vrai node: il part de
// l'index 1 au lieu de 2, ce qui injecte le chemin de cli.js dans les arguments.
// `process.defaultApp` rétablit la découpe attendue.
const path = require('node:path')
const { spawn } = require('node:child_process')

const cli = path.join(__dirname, 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js')
const child = spawn(process.execPath, ['--no-warnings', '--require', path.join(__dirname, 'wrun-preload.cjs'), cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
})
child.on('exit', (code) => process.exit(code === null ? 1 : code))
