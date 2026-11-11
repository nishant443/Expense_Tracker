/// <reference types="vitest" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'offline.html'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        id: '/',
        name: 'ExpenseFlow – Personal Finance',
        short_name: 'ExpenseFlow',
        description: 'Track expenses, budgets and savings — beautifully, even offline.',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        // Desktop: draw our own title bar; the OS keeps minimise / maximise / close.
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'portrait',
        background_color: '#F7F8FA',
        theme_color: '#2563EB',
        categories: ['finance', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Add expense', short_name: 'Add', url: '/transactions/new?type=expense', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Statistics', url: '/analytics', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      // Same-origin API in development (mirrors the production rewrite).
      '/api': { target: process.env.VITE_DEV_API_TARGET ?? 'http://localhost:4000', changeOrigin: false },
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          data: ['@tanstack/react-query', 'dexie', 'zod', 'react-hook-form'],
        },
      },
    },
  },
});
