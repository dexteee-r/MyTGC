import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/* `npm run dev` serves plain http, which is enough for everything except the
   camera. `npm run dev:https` adds a self-signed certificate, because
   getUserMedia only runs in a secure context — over http on a LAN address the
   live scanner cannot start at all, and the app falls back to photo mode.
   Safari will warn about the certificate once; accept it and the camera works. */
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'https' ? [basicSsl()] : [])],
  server: {
    // One origin in dev, so no CORS and no absolute URLs in the client. The proxy
    // target stays plain http: it is a server-to-server hop on the same machine.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
}))
