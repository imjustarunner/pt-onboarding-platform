import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], test: {
 environment: 'jsdom', include: ['src/views/__tests__/PublicIntakeGuardianResume.test.js', 'src/components/guardian/__tests__/GuardianEnrollmentStart.test.js'], restoreMocks: true
} });
