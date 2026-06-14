import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import uploadMenuImage from './api/menu-image/upload.js'
import deleteMenuImage from './api/menu-image/delete.js'

const SERVER_ENV_KEYS = [
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_BASE_URL',
  'R2_ENDPOINT',
]

function loadServerEnv(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  SERVER_ENV_KEYS.forEach(key => {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  })
}

function localApiRoutes() {
  return {
    name: 'local-api-routes',
    configureServer(server) {
      server.middlewares.use('/api/menu-image/upload', (req, res) => uploadMenuImage(req, res))
      server.middlewares.use('/api/menu-image/delete', (req, res) => deleteMenuImage(req, res))
    },
  }
}

export default defineConfig(({ mode }) => {
  loadServerEnv(mode)

  return {
    plugins: [react(), localApiRoutes()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('@supabase')) return 'supabase'
            if (id.includes('@dnd-kit')) return 'dnd'
            if (id.includes('react')) return 'react-vendor'
            if (id.includes('lucide-react')) return 'icons'
            return 'vendor'
          },
        },
      },
    },
  }
})
