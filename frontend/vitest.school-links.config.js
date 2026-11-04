import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue({ template: { transformAssetUrls: false } })],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'https://app.itsco.health/itsco/admin/school-referral-hub' } },
    restoreMocks: true,
    include: [
      'src/utils/__tests__/publicIntakeUrl.test.js',
      'src/utils/__tests__/publicSchoolPrintablePacketUrl.test.js',
      'src/utils/__tests__/schoolEnrollmentLink.test.js',
      'src/utils/__tests__/schoolCareBridge.test.js',
      'src/router/__tests__/schoolCareBridgeRoutes.test.js',
      'src/components/school/__tests__/SchoolClientChatModal.test.js',
      'src/components/school/redesign/__tests__/PublicDocumentsPanel.test.js',
      'src/views/school/__tests__/SchoolReferralHubView.test.js'
    ]
  }
});
