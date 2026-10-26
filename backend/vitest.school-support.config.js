export default {
 root: new URL('.', import.meta.url).pathname,
 resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
 test: { environment: 'node', include: ['src/**/__tests__/schoolAdminAccessRequest.test.js', 'src/**/__tests__/schoolStaffWelcomeEmail.test.js', 'src/**/__tests__/schoolProviderAssignment.test.js', 'src/controllers/__tests__/schoolStaffPhone.test.js'], restoreMocks: true }
};
