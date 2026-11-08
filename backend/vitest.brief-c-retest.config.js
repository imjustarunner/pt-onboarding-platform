export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/utils/__tests__/intakeCaptchaPolicy.test.js',
    'src/controllers/__tests__/publicIntakeCaptcha.test.js',
    'src/controllers/__tests__/schoolRoiEvidence.test.js',
    'src/models/__tests__/signedSchoolRoiClientScope.test.js',
    'src/utils/__tests__/schoolRoiCalendarDate.test.js',
    'src/models/__tests__/qaClientCreation.test.js',
    'src/services/__tests__/guardianPendingEnrollment.test.js',
    'src/services/__tests__/paperPacketBytes.test.js',
    'src/services/__tests__/privatePacketScanJob.test.js',
    'src/services/__tests__/referralPacketMatch.test.js'
  ], restoreMocks: true }
};
