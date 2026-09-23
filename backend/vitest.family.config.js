export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/familyPocketDelivery.test.js', 'src/services/__tests__/familyFocusMusic.test.js', 'src/services/__tests__/calendarPublicationSync.test.js', 'src/services/__tests__/calendarPublication.test.js', 'src/services/__tests__/familyEmailRouting.test.js', 'src/services/__tests__/familyEmail.test.js', 'src/services/__tests__/familyPolicy.test.js', 'src/services/__tests__/familyAuth.test.js', 'src/services/__tests__/family.service.test.js', 'src/services/__tests__/familyHomeTools.test.js', 'src/services/__tests__/familyCalendar.test.js'], restoreMocks: true }
};
