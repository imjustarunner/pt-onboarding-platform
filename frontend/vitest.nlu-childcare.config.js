import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], test: { environment: 'jsdom', include: ['src/utils/__tests__/childcarePresentation.test.js', 'src/components/hiring/__tests__/ChildcareRateScheduleEditor.test.js', 'src/components/hiring/__tests__/ContractServiceRolesEditor.test.js', 'src/views/__tests__/ChildcareShiftsView.test.js'] } });
