import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // 127.0.0.1 (not "localhost") avoids IPv6 connection errors on Windows
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});