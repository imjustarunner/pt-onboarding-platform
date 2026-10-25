import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:[
 'src/utils/__tests__/contactInput.test.js',
 'src/utils/__tests__/workspaceDestination.test.js',
 'src/views/__tests__/PublicIntakeProviderSelection.test.js',
 'src/components/public-intake/__tests__/InsurancePaymentEnrollment.test.js',
 'src/components/dashboard/__tests__/DashboardWork.test.js',
 'src/components/availability/__tests__/VirtualWorkingHoursEditor.test.js'
]}});
