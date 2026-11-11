import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], test: { environment: 'jsdom', include: [
  'src/views/admin/__tests__/PayrollWizardFlow.test.js',
  'src/views/admin/__tests__/PayrollPendingSubmissions.test.js',
  'src/composables/__tests__/usePayrollClaimReview.test.js',
  'src/components/payroll/__tests__/PayrollProcessChangesPanel.test.js',
  'src/components/payroll/__tests__/PayrollRawImportPanel.test.js',
  'src/components/payroll/__tests__/PayrollStageCompliance.test.js',
  'src/components/payroll/__tests__/PayrollWizardPanels.test.js',
  'src/utils/__tests__/payrollWizardFlow.test.js'
] } });
