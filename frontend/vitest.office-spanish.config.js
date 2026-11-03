import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], test: { environment: 'jsdom', include: [
  'src/constants/__tests__/officeIntakeSpanish.test.js',
  'src/constants/__tests__/structuredIntakeStepSpanish.test.js',
  'src/views/__tests__/PublicIntakeSpanishFallback.test.js',
  'src/components/public-intake/__tests__/OfficeSpanishDisplay.test.js'
] } });
