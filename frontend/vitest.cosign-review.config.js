import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    environment: 'jsdom',
    include: [
      'src/components/clinical/__tests__/ClinicalNote*Review*.test.js',
      'src/components/clinical/__tests__/ClinicalNoteAmendmentFlow.test.js',
      'src/components/clinical/__tests__/ClinicalNoteDetailFetcher.test.js',
      'src/components/clinical/__tests__/CosignReviewTimer.test.js',
      'src/components/clinical/__tests__/H0002ScreeningReview.test.js',
      'src/views/__tests__/NotesWorkspaceQueueLaunch.test.js',
      'src/components/tasks/__tests__/TasksNotesQueue.test.js',
      'src/components/clinical/__tests__/NoteAidWorkQueuePanel.review.test.js',
      'src/utils/__tests__/supervisorNoteReview.test.js',
      'src/utils/__tests__/chunkLoadRecovery.test.js',
      'src/views/admin/__tests__/ClinicalNoteGeneratorView.smoke.test.js'
    ]
  }
});
