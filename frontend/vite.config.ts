import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Ask before swapping in a new version so nobody loses a half-filled form.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FieldBasket',
        short_name: 'FieldBasket',
        description: 'Buy fresh produce directly from verified farmers in Ekiti State.',
        theme_color: '#172b22',
        background_color: '#172b22',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/shop',
        scope: '/',
        lang: 'en-NG',
        categories: ['food', 'shopping', 'business'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Public marketplace data: fresh when online, last copy when offline.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              /^\/products(\/[0-9a-f-]{36})?$/i.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'fieldbasket-market',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'res.cloudinary.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fieldbasket-photos',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'fieldbasket-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
