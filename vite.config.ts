import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 는 https://ginsaram.github.io/Diary/ 처럼 하위 경로에 올라가므로
  // asset 경로를 저장소 이름에 맞춰 줍니다.
  base: '/Diary/',
  plugins: [react()],
})
