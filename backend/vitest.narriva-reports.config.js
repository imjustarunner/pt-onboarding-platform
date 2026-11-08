export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/narrivaReport*.test.js','src/services/__tests__/narrivaComplianceReports*.test.js','src/services/__tests__/sessionAiPrivacy.test.js','src/services/__tests__/geminiText.abort.test.js','src/services/__tests__/clinicalPlanGenerationConfig.test.js'],fileParallelism:false,testTimeout:20000,hookTimeout:20000}
};
