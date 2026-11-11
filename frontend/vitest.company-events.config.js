import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    environment: 'jsdom',
    include: [
      'src/components/admin/__tests__/CompanyEventsManager*.test.js',
      'src/components/admin/__tests__/EventPeoplePicker.test.js',
      'src/components/admin/__tests__/EventLinkedPolls.test.js',
      'src/components/admin/__tests__/StaffEventForm.operations.test.js',
      'src/utils/__tests__/eventOperations.test.js',
      'src/views/public/__tests__/CompanyEventStaffView.test.js',
      'src/views/public/__tests__/CompanyEventRsvpView.test.js',
      'src/components/dashboard/__tests__/StaffPollsPanel*.test.js',
      'src/components/messages/__tests__/StartConversationModal.test.js',
      'src/components/messages/__tests__/MessageThreadList.test.js',
      'src/components/notifications/__tests__/CompanyEventAnnouncements.test.js'
    ],
    restoreMocks: true
  }
});
