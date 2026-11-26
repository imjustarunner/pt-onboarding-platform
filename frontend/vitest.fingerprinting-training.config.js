import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: [
      'src/components/prehire/__tests__/HireFingerprintingGuide.test.js',
      'src/components/training/__tests__/FingerprintingTrainingGuide.test.js',
      'src/views/__tests__/TrainingPlayerQuiz.test.js'
    ]
  }
});
