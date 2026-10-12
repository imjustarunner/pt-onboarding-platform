export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/toastAnnouncements.test.js', 'src/controllers/__tests__/agencyAnnouncementToasts.test.js', 'src/routes/__tests__/auricwellPreviewToasts.test.js'], restoreMocks: true }
};
