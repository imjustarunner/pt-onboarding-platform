export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/content/__tests__/providerRolesNovember2026.test.js'],restoreMocks:true}
};
