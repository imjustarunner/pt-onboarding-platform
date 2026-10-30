import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'jsdom', include: [
    'src/services/__tests__/api.publicAuthForm.test.js',
    'src/services/__tests__/api.rateLimit.test.js',
    'src/views/__tests__/LoginPortalIsolation.test.js',
    'src/utils/__tests__/schoolCareBridge.test.js',
    'src/utils/__tests__/apiBaseUrl.test.js',
    'src/utils/__tests__/loginRemember.test.js'
  ] }
});
