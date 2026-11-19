import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.KANOOK_BACKEND_URL || 'https://kanook.oru-el.com'
  const base: ProxyOptions = { target, changeOrigin: true, proxyTimeout: 30000 }
  // Forward browser sessions unchanged. Never inject an administrator or shared key.
  const proxy = {
    '/account/v1': { ...base },
    '/workspace': { ...base },
    '/qc-api': { ...base, rewrite: (path: string) => path.replace(/^\/qc-api/, '') },
  }
  return { plugins: [react()], base: env.VITE_BASE_PATH || '/',
    server: { host: '127.0.0.1', proxy, watch: { ignored: ['**/.local/**', '**/.venv/**', '**/.tmp/**'] } },
    preview: { host: '127.0.0.1', proxy } }
})
