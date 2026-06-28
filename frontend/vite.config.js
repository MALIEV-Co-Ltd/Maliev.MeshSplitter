import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  base: process.env.VITE_ASSET_BASE || '/',
  plugins: [vue()],
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // The voxel repair worker (voxelRemesh.worker.js) dynamically imports
  // manifold-3d, which code-splits — that requires ES module output for
  // workers (Vite's default IIFE format can't support code-split chunks).
  worker: {
    format: 'es',
  },
})
