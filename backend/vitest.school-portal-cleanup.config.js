export default {
  root: new URL('.', import.meta.url).pathname,
  test: {
    environment: 'node',
    include: ['src/services/__tests__/districtCalendarDates.test.js', 'src/controllers/__tests__/schoolPortalRoiBoundaries.test.js'],
    restoreMocks: true
  }
};
