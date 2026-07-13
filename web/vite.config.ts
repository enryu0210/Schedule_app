import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 설정: React 플러그인만 사용하는 최소 구성.
// Vercel 배포 시 별도 설정 없이 `vite build` 결과물(dist)을 그대로 서빙할 수 있음.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
});
