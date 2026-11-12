export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',env:{SKIP_DB_CONNECT:'1'},restoreMocks:true,include:[
  'src/services/__tests__/childcare.*.test.js',
  'src/services/__tests__/nluCompensationPolicy.test.js',
  'src/services/__tests__/compensationCategories.test.js',
  'src/services/__tests__/hire.contractServiceRoles.test.js',
  'src/content/__tests__/employmentCategoryLevelTerms.test.js'
 ]}
};
