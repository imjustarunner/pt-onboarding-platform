import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, cacheDir: '/private/tmp/noteworthy-demo-ui-vite-cache', plugins: [vue()], test: { environment: 'jsdom', include: ['src/components/noteworthy/__tests__/NoteworthyTrialExperience.test.js', 'src/views/public/__tests__/NoteworthyOnboarding.test.js', 'src/views/public/__tests__/NoteworthyWorkspace.test.js'] } });
