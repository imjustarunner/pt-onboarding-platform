import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname, plugins:[vue()],
  test: { environment:'jsdom', include:[
    'src/components/admin/clientChart/__tests__/ClientEhrBringUpToDatePanel.test.js',
    'src/components/admin/clientChart/__tests__/ClientChartUpdateModal.test.js',
    'src/components/admin/clientChart/__tests__/ClientRecordsCreateModal.test.js',
    'src/components/admin/clientChart/__tests__/ClientSupplementaryRecords.test.js',
    'src/components/admin/clientChart/__tests__/ClientPayerLinkage.test.js',
    'src/components/admin/clientChart/__tests__/ClientSchoolChartSetup.test.js',
    'src/components/clients/__tests__/ClientAgencyLogo.test.js', 'src/composables/__tests__/useChartImportDrafts.test.js',
    'src/services/__tests__/api.chartAgencyContext.test.js'
  ] }
});
