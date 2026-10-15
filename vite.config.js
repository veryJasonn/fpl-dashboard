import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only: runs the Vercel serverless functions in api/ inside Vite's dev server, so
// `npm run dev` alone is enough locally. Vercel itself handles /api routing in
// production — this plugin is never used there.
function fplApiDevPlugin() {
  const routes = [
    {
      pattern: /^\/api\/leagues-classic\/(\d+)\/overview\/?$/,
      modulePath: './api/leagues-classic/[id]/overview.js',
    },
    {
      pattern: /^\/api\/leagues-classic\/(\d+)\/live\/?$/,
      modulePath: './api/leagues-classic/[id]/live.js',
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

        req.query = { ...Object.fromEntries(url.searchParams), id: url.pathname.match(route.pattern)[1] }
        res.status = (code) => {
          res.statusCode = code
          return res
        }
        res.json = (body) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }

        try {
          // Cache-bust so edits to api/*.js take effect without restarting the dev server.
          const { default: handler } = await import(`${route.modulePath}?update=${Date.now()}`)
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
