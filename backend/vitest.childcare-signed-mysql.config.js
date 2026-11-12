export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',env:{SKIP_DB_CONNECT:'1'},restoreMocks:true,include:['src/services/__tests__/childcare.signedPayroll.mysql.test.js'],testTimeout:60000,hookTimeout:120000}
};
