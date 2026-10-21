import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } }, test: { environment: 'jsdom', include: [
  'src/components/schedule/__tests__/OfficeEventSessionNotePanel.test.js',
  'src/config/__tests__/noteAidAccess.test.js', 'src/config/__tests__/noteAidWorkspace.test.js',
  'src/utils/__tests__/noteAidLaunch.test.js', 'src/utils/__tests__/clinicalWorkspace.test.js',
  'src/components/clinicalWorkspace/__tests__/ClinicalWorkspaceFrame.test.js',
  'src/views/admin/__tests__/ClinicalNoteGeneratorView.smoke.test.js',
  'src/views/__tests__/NotesWorkspaceQueueLaunch.test.js',
  'src/components/dashboard/__tests__/DashboardWork.test.js',
  'src/components/tasks/__tests__/TasksNotesQueue.test.js'
] } });
