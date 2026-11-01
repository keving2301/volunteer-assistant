// Serves the Netlify Functions' handlers from the Vite dev server, so `npm run dev` runs the front end and the API on
// one port with the same code Netlify runs. Set VAS_ENV_FILE to a file with the server variables (see .env.example);
// keep that file outside the repository.

import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

export function netlifyFunctionsInDev(): Plugin {
  return {
    name: 'netlify-functions-in-dev',
    apply: 'serve',
    configureServer(server) {
      if (process.env.VAS_ENV_FILE) process.loadEnvFile(process.env.VAS_ENV_FILE)
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        try {
          const url = new URL(req.url, `http://${req.headers.host}`)
          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
            else if (value !== undefined) headers.set(key, value)
          }
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
          const request = new Request(url, { method: req.method, headers, body: hasBody ? await readBody(req) : undefined })
          let response: Response
          if (url.pathname === '/api/session/demo') {
            const mod = await server.ssrLoadModule('/netlify/lib/demo-sign-in.ts')
            response = await mod.handleDemoSignIn(request, { ip: req.socket.remoteAddress })
          } else {
            const mod = await server.ssrLoadModule('/netlify/lib/api.ts')
            response = await mod.handleApi(request)
          }
          res.statusCode = response.status
          response.headers.forEach((value, key) => {
            if (key !== 'set-cookie') res.setHeader(key, value)
          })
          const cookies = response.headers.getSetCookie()
          if (cookies.length) res.setHeader('set-cookie', cookies)
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          next(error)
        }
      })
    },
  }
}
