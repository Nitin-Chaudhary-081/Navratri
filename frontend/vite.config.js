import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Navratri Gate Scanner',
        short_name: 'GarbaScan',
        theme_color: '#7A0C1A',
        background_color: '#0F0510',
        display: 'standalone',
        icons: [{ src: '/img/hero-durga-eyes.jpeg', sizes: '512x512', type: 'image/jpeg' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,jpeg,png,svg}'] },
    }),
  ],
  // NOTE: backend runs on 4001 locally (4000 held by a stuck process until reboot).
  // allowedHosts lets you share the site via a tunnel (trycloudflare/ngrok) or LAN IP.
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.loca.lt'],
    proxy: { '/api': 'http://localhost:4001' },
  },
});
