import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi chạy `npm run dev`, mọi request /api được chuyển sang backend,
// nên trình duyệt coi frontend và API là cùng một địa chỉ (cookie đăng nhập hoạt động, không cần CORS).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: ['..'] }, // cho phép đọc code dùng chung ở ../shared
    proxy: {
      '/api': process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
    },
  },
});
