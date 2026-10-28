import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], test: { environment: 'jsdom', include: ['src/composables/__tests__/useEnrollmentTermination.test.js', 'src/components/public-intake/__tests__/EnrollmentTerminationDialog.test.js', 'src/utils/__tests__/publicIntakeTitle.test.js', 'src/views/admin/__tests__/UnfinishedDigitalFormsView.test.js'] } });
