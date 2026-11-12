export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',restoreMocks:true,include:[
  'src/utils/__tests__/syntheticQaCaptchaPolicy.test.js',
  'src/utils/__tests__/intakeCaptchaPolicy.test.js',
  'src/services/__tests__/syntheticQaCaptcha.service.test.js',
  'src/services/__tests__/publicAgencySupport.qaCaptcha.test.js',
  ...((process.env.QA_CAPTCHA_MYSQL_SOCKET || process.env.REQUIRE_QA_CAPTCHA_MYSQL === '1') ? ['src/services/__tests__/syntheticQaCaptcha.mysql.test.js'] : []),
  'src/controllers/__tests__/publicIntakeCaptcha.test.js',
  'src/services/__tests__/itscoInternshipInquiry.test.js'
 ]}
};
