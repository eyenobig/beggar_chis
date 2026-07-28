import net from 'node:net'
import { createServer } from 'vite'

const PORT = 1420
const DEV_URL = `http://localhost:${PORT}`
const LOOPBACKS = ['::1', '127.0.0.1']
const SIGNATURE = '<meta name="chis-dev-server" content="beggar_chis"'

function portIsOpen(host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: PORT })
    const finish = (open) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(500)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function isBeggarChisVite(host) {
  const url = host.includes(':') ? `http://[${host}]:${PORT}` : `http://${host}:${PORT}`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) })
    return response.ok && (await response.text()).includes(SIGNATURE)
  } catch {
    return false
  }
}

const openHosts = []
for (const host of LOOPBACKS) {
  if (await portIsOpen(host)) openHosts.push(host)
}
if (openHosts.length > 0) {
  for (const host of openHosts) {
    if (await isBeggarChisVite(host)) {
      console.log(`[vite:single] Reusing beggar_chis dev server at ${DEV_URL}`)
      process.exit(0)
    }
  }
  console.error(`[vite:single] Port ${PORT} is occupied by another application.`)
  process.exit(1)
}

const server = await createServer()
await server.listen()
server.printUrls()

const close = async () => {
  await server.close()
  process.exit(0)
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
await new Promise(() => {})
