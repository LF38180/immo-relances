import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Sépare les libs en chunks stables (cachés par le navigateur entre déploiements).
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-charts': ['recharts'],
          'vendor-utils': ['axios', 'date-fns', 'papaparse', 'lucide-react', 'react-hot-toast'],
        },
      },
    },
  },
})
