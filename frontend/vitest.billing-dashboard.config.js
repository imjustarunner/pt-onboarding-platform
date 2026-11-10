import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:['src/components/dashboard/__tests__/AuricwellBillingSummary.test.js','src/components/admin/__tests__/ClaimMdWorkspace.test.js','src/components/billing/__tests__/ClaimWorkTable.test.js','src/views/admin/__tests__/BillingWorkspaceView.test.js','src/views/admin/__tests__/TenantAdminDashboard.loading.test.js','src/views/admin/__tests__/AdminDashboardWorkspace.test.js','src/views/admin/__tests__/AdminDashboard.workspace.test.js']}});
