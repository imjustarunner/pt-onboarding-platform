import base from './vitest.claimmd.config.js';
export default { ...base, test: { ...base.test, include:[...base.test.include,'src/models/__tests__/OfficeLocation.physical.test.js'] } };
