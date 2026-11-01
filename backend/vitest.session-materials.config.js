export default { root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/sessionSupportingMaterials.test.js', 'src/services/__tests__/sessionMaterialScan.test.js', 'src/services/__tests__/sessionMaterialEncryption.test.js'], restoreMocks: true } };
