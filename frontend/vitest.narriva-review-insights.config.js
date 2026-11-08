import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } }, test: { environment: 'jsdom', include: [
  'src/components/clinical/__tests__/NoteReviewActions.test.js',
  'src/components/clinical/__tests__/NarrivaTreatmentHistory.test.js',
  'src/components/clinical/__tests__/NarrivaLongitudinalReview.test.js',
  'src/components/clinical/__tests__/NoteAidWorkQueuePanel.review.test.js',
  'src/mobile/__tests__/MobileMyWork.test.js',
  'src/utils/__tests__/noteAidLaunch.test.js',
  'src/components/tasks/__tests__/TasksNotesQueue.test.js'
] } });
