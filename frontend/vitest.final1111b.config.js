import vue from '@vitejs/plugin-vue';
export default {
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.js'], include: [
    'src/components/school/__tests__/SchoolRoiCalendarDisplay.test.js',
    'src/views/__tests__/SecureMessageClaimArtwork.test.js',
    'src/utils/__tests__/portalDates.test.js'
  ] }
};
