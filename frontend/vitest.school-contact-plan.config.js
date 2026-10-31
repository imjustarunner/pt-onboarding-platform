import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], test: { environment: 'jsdom', include: ['src/components/school/__tests__/SchoolContactPlanSplash.test.js', 'src/components/school/__tests__/SchoolContactWorkflowCard.test.js', 'src/components/school/__tests__/SchoolClientChatModal.test.js'] } });
