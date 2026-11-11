import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: [
      'src/utils/__tests__/auricwellMedicalArchive.test.js',
      'src/utils/__tests__/auricwellTransitionClient.test.js',
      'src/utils/__tests__/auricwellClientImport.test.js',
      'src/utils/__tests__/schoolSoftScheduleBlocks.test.js',
      'src/components/admin/__tests__/AuricWell*.test.js',
      'src/components/admin/clientChart/__tests__/ClientEhrBringUpToDatePanel.test.js',
      'src/components/school/redesign/__tests__/SchoolBookedSessions.test.js',
      'src/components/admin/__tests__/EhrPatientListImportModal.test.js',
      'src/navigation/__tests__/auricwellManagement.test.js'
    ]
  }
});
