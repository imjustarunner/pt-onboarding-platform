import vue from '@vitejs/plugin-vue';
export default {
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.js'], include: [
    'src/utils/__tests__/taskOrganizationScope.test.js',
    'src/components/admin/__tests__/ClientServiceEnrollments.providers.test.js',
    'src/composables/__tests__/useFamilyLocale.test.js',
    'src/constants/__tests__/structuredIntakeStepSpanish.test.js',
    'src/views/__tests__/PublicIntakeInsuranceContinue.test.js',
    'src/views/__tests__/PublicIntakeLegalLocale.test.js'
  ] }
};
