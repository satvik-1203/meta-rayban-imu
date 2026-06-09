import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage, createServer } from 'http'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_DIR = path.join(__dirname, '../client')

interface GlassesSession { ws: WebSocket; connectedAt: number }
interface MobileSession { ws: WebSocket; connectedAt: number }

const glassesSessions = new Map<string, GlassesSession>()
const mobileSessions = new Map<string, Set<MobileSession>>()

function parseRoute(url: string | undefined): { role: 'glasses' | 'mobile'; glassesId: string } | null {
  if (!url) return null
  const glassesMatch = url.match(/^\/glasses\/([^/?]+)/)
  if (glassesMatch) return { role: 'glasses', glassesId: glassesMatch[1] }
  const mobileMatch = url.match(/^\/mobile\/([^/?]+)/)
  if (mobileMatch) return { role: 'mobile', glassesId: mobileMatch[1] }
  return null
}

// --- HTTP server (serves client app + handles WS upgrades) ---
const app = express()
app.use('/glasses/app', express.static(CLIENT_DIR))

const httpServer = createServer(app)
const wss = new WebSocketServer({ noServer: true })

httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
  const route = parseRoute(req.url)
  if (!route) { socket.destroy(); return }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
})

// --- WebSocket relay ---
wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const route = parseRoute(req.url)!
  const { role, glassesId } = route

  if (role === 'glasses') {
    glassesSessions.set(glassesId, { ws, connectedAt: Date.now() })
    console.log(`[+] glasses connected  id=${glassesId}`)

    ws.on('message', (data: Buffer) => {
      const subscribers = mobileSessions.get(glassesId)
      if (!subscribers) return
      for (const session of subscribers) {
        if (session.ws.readyState === WebSocket.OPEN) session.ws.send(data)
      }
    })

    ws.on('close', () => { glassesSessions.delete(glassesId); console.log(`[-] glasses disconnected  id=${glassesId}`) })
    ws.on('error', (err: Error) => { console.error(`[!] glasses error:`, err.message); glassesSessions.delete(glassesId) })

  } else {
    const session: MobileSession = { ws, connectedAt: Date.now() }
    if (!mobileSessions.has(glassesId)) mobileSessions.set(glassesId, new Set())
    mobileSessions.get(glassesId)!.add(session)
    console.log(`[+] mobile connected   id=${glassesId} (${mobileSessions.get(glassesId)!.size} subscribers)`)

    ws.on('close', () => {
      mobileSessions.get(glassesId)?.delete(session)
      if (mobileSessions.get(glassesId)?.size === 0) mobileSessions.delete(glassesId)
      console.log(`[-] mobile disconnected  id=${glassesId}`)
    })
    ws.on('error', (err: Error) => { console.error(`[!] mobile error:`, err.message); mobileSessions.get(glassesId)?.delete(session) })
  }
})

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`  Client app → http://localhost:${PORT}/glasses/app`)
  console.log(`  Glasses WS → ws://localhost:${PORT}/glasses/:glassesId`)
  console.log(`  Mobile WS  → ws://localhost:${PORT}/mobile/:glassesId`)
})
