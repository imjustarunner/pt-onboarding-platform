export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/coverageSyntheticQa.mysql.test.js','src/services/__tests__/claimMdAssignmentCoverageReview.test.js','src/services/__tests__/claimMdCoverage.test.js'],restoreMocks:true}
};
