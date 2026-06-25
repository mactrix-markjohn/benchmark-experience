import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  server: {
    allowedHosts: ['.ngrok-free.dev'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        basketballClassic: resolve(__dirname, 'basketball-classic.html'),
        arcadeBasketball: resolve(__dirname, 'arcade-basketball.html'),
      }
    }
  }
})
