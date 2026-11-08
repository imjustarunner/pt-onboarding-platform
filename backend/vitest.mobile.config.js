export default {
  root:new URL('.',import.meta.url).pathname,
  resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
  test:{environment:'node',include:['src/services/mobile/__tests__/*.test.js','src/services/__tests__/familyPortalEmail.secureNotify.test.js','src/services/__tests__/familyPortalEmail.content.test.js'],restoreMocks:true}
};
