export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/auricwellPricing.test.js','src/services/__tests__/auricwellPricing.mysql.test.js','src/services/__tests__/meetingProductPlanPolicy.test.js','src/services/__tests__/meetingAccessPlan.test.js']}
};
