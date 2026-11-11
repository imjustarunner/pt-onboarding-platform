import vue from '@vitejs/plugin-vue';

// Focused suite without public-site build plugins or network/deployment hooks.
export default {
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.js'],
    include: [
      'src/components/session-comments/__tests__/SecureSessionComments.test.js',
      'src/views/guardian/__tests__/DependentPortalView.test.js',
      'src/components/guardian/__tests__/FamilyPortalRefinement.test.js',
      'src/components/guardian/__tests__/FamilyPortalNavigation.test.js',
      'src/components/guardian/__tests__/GuardianAppointmentsPanel.test.js',
      'src/components/conversa/__tests__/SecureMessages.test.js',
      'src/components/guardian/__tests__/GuardianAccess.test.js',
      'src/components/schedule/__tests__/AppointmentStaffTools.test.js',
      'src/components/messages/__tests__/MessagesHubShell.threading.test.js'
    ]
  }
};
