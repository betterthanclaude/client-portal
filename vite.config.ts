import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const configPath = env.KANOOK_QC_CLIENT_CONFIG
  const client = configPath ? JSON.parse(readFileSync(configPath, 'utf8')) : {}
  const tokenPath = env.KANOOK_QC_TOKEN_FILE || (client.token_file && resolve(dirname(configPath), client.token_file))
  const proxy = {
    '/workspace': {
      target: env.KANOOK_INTAKE_URL || 'http://127.0.0.1:8782',
      changeOrigin: true,
      configure: (server: Parameters<NonNullable<import('vite').ProxyOptions['configure']>>[0]) => {
        server.on('proxyReq', (request, incoming) => {
          request.removeHeader('X-Kanook-Service')
          if (incoming.headers.authorization) return
          try {
            request.setHeader('X-Kanook-Service', readFileSync(resolve('.local/service.key'), 'utf8').trim())
          } catch { /* The intake service may not be started yet. */ }
        })
      },
    },
    '/qc-api': {
      target: env.KANOOK_QC_API_URL || client.control_url || 'http://127.0.0.1:8781',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/qc-api/, ''),
      configure: (server: Parameters<NonNullable<import('vite').ProxyOptions['configure']>>[0]) => {
        server.on('proxyReq', (request) => {
          request.removeHeader('Authorization')
          request.removeHeader('Cookie')
          if (tokenPath) {
            try { request.setHeader('Authorization', `Bearer ${readFileSync(tokenPath, 'utf8').trim()}`) }
            catch { /* Missing credentials are reported by the API, never exposed to the browser. */ }
          }
        })
      },
      proxyTimeout: 15000,
    },
  }
  return { plugins: [react()], server: { host: '127.0.0.1', proxy, watch: { ignored: ['**/.local/**', '**/.venv/**', '**/.tmp/**'] } }, preview: { host: '127.0.0.1', proxy } }
})
