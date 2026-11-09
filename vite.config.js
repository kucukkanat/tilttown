import {defineConfig} from 'vite';

// Stamps each build so the page can detect a newer deploy and reload (see the tiltUpd script in index.html).
const buildStamp = () => ({
  name: 'build-stamp',
  transformIndexHtml: (html, ctx) => html.replaceAll('__BUILD__', ctx.server ? 'dev' : new Date().toISOString().replace(/\D/g, '').slice(0, 14)),
});

export default defineConfig({
  base: './',
  plugins: [buildStamp()],
  build: {target: 'es2022', chunkSizeWarningLimit: 2000},
});
