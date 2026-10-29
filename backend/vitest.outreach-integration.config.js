import base from './vitest.jacquelyne-time.config.js';
export default { ...base, test: { ...base.test, include: [...base.test.include,
  'src/services/__tests__/outreachTripEvent.test.js', 'src/services/__tests__/outreachSchoolHistory.test.js'
] } };
