export default {
 root: new URL('.', import.meta.url).pathname,
 resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
 test: { environment: 'node', include: ['src/routes/__tests__/schoolCareBridge*.test.js','src/controllers/__tests__/schoolCareBridgeIdentify.test.js','src/services/__tests__/schoolCareBridgeAgreement.test.js','src/services/__tests__/schoolCareBridgeBilling.test.js','src/middleware/__tests__/schoolCareBridgeScope.test.js'], restoreMocks: true }
};
