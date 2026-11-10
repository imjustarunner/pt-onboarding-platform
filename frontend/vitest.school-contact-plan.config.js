import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], test: { environment: 'jsdom', include: ['src/components/dashboard/__tests__/AccountHubDeepLink.test.js', 'src/components/school/__tests__/SchoolContactPlanSplash.test.js', 'src/components/school/__tests__/SchoolContactWorkflowCard.test.js', 'src/components/school/__tests__/SchoolClientChatModal.test.js', 'src/components/school/__tests__/FamilyWelcomeSettings.test.js', 'src/navigation/__tests__/familyWelcomeSearch.test.js'] } });
