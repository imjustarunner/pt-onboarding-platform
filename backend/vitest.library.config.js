export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: {
    environment: 'node',
    include: [
      'src/controllers/__tests__/libraryDocuments.test.js',
      'src/services/__tests__/libraryPdf.test.js',
      'src/services/__tests__/libraryUploads.test.js',
      'src/services/__tests__/libraryVideo.test.js'
    ],
    restoreMocks: true
  }
};
