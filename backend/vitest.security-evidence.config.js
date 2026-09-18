export default {
  root: new URL('.', import.meta.url).pathname,
  test: { environment: 'node', include: ['src/**/__tests__/securityEvidence*.test.js', 'src/**/__tests__/sessionSecurity*.test.js', 'src/**/__tests__/accountSecurity*.test.js', 'src/**/__tests__/activityProtection*.test.js'], restoreMocks: true, unstubEnvs: true }
};
