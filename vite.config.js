import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Con `npm run dev` las rutas /api se derivan al deploy de Vercel o a `vercel dev`.
    proxy: process.env.VITE_API_PROXY ? { '/api': { target: process.env.VITE_API_PROXY, changeOrigin: true } } : undefined,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: { charts: ['recharts'], supabase: ['@supabase/supabase-js'] } },
    },
  },
});
