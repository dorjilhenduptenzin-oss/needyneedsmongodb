
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Use root-relative base in production. Relative ('./') causes issues with some CDNs.
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    emptyOutDir: true,
    // inline small assets to reduce extra requests
    assetsInlineLimit: 4096,
    // reasonable chunk size warning for this app
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: {
          vendor: ['react', 'react-dom']
        }
      }
    }
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      // dev-only proxy: keep local API calls routed to localhost:4000 during development
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  },
  preview: {
    // so `npm run preview` (production build) can also reach a local API
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
})
