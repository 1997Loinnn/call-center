import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Ishlab chiqishda API va WebSocket backend'ga proksi qilinadi, shuning uchun
// httpOnly cookie bir xil origin'da ishlaydi (ishlab chiqarishda bu vazifani nginx bajaradi).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Kutubxonalar alohida chunk'larda: ilova yangilanganda brauzer keshidan qayta foydalaniladi
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
        },
      },
    },
    // antd ~400 KB (gzip) — ichki tarmoq uchun maqbul; chunk brauzer keshida qoladi
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
