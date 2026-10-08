// Compilación de la DEMO: un único archivo HTML con todo adentro y backend simulado.
//   npm run build:demo   →   dist-demo/index.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify('1') },
  base: './',
  publicDir: false,
  build: { outDir: 'dist-demo', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000 },
});
