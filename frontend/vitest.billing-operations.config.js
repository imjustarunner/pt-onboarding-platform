import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',include:[
  'src/components/billing/__tests__/ClaimWorkTable.test.js',
  'src/components/billing/__tests__/BillingOperations.test.js',
  'src/components/billing/__tests__/CostEstimatePreview.test.js',
  'src/components/admin/__tests__/ClaimMdWorkspace.test.js',
  'src/components/admin/__tests__/SupervisedPayerPolicies.test.js',
  'src/components/tasks/__tests__/TasksNotesQueue.test.js',
  'src/views/admin/__tests__/BillingWorkspaceView.test.js',
  'src/utils/__tests__/notificationActions.test.js'
]}});
