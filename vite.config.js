import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only: runs the Vercel serverless function (api/leagues-classic/[id]/standings.js)
// inside Vite's dev server, so `npm run dev` alone is enough locally. Vercel itself
// handles /api routing in production — this plugin is never used there.
function fplApiDevPlugin() {
  const routes = [
    {
      pattern: /^\/api\/leagues-classic\/(\d+)\/standings\/?$/,
      modulePath: './api/leagues-classic/[id]/standings.js',
    },
    {
      pattern: /^\/api\/entry\/(\d+)\/history\/?$/,
      modulePath: './api/entry/[id]/history.js',
    },
  ]

  return {
    name: 'fpl-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        const route = routes.find((r) => r.pattern.test(url.pathname))
        if (!route) {
          next()
          return
        }

        req.query = { id: url.pathname.match(route.pattern)[1] }
        res.status = (code) => {
          res.statusCode = code
          return res
        }
        res.json = (body) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }

        try {
          const { default: handler } = await import(route.modulePath)
          await handler(req, res)
        } catch (err) {
          res.status(500).json({ error: 'Internal error' })
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), fplApiDevPlugin()],
})
