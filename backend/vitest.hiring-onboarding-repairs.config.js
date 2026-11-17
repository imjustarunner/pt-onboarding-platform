export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/models/__tests__/hire.portalLinkUser.test.js',
    'src/utils/__tests__/hire.signingPdf.test.js',
    'src/utils/__tests__/hire.pdfFields.test.js',
    'src/services/__tests__/hire.compensationReview.test.js',
    'src/services/__tests__/hire.contractSignatureFields.test.js',
    'src/services/__tests__/hire.forms.test.js',
    'src/services/__tests__/hire.onboardingInvite.test.js',
    'src/services/__tests__/companyDocumentLearning.test.js',
    'src/services/__tests__/documentTrainingContent.test.js'
  ] }
};
