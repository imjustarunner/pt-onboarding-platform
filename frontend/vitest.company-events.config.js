import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue({ template: { transformAssetUrls: false } })],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    environment: 'jsdom',
    include: [
      'src/components/admin/__tests__/CompanyEventsManager*.test.js',
      'src/components/admin/__tests__/EventPeoplePicker.test.js',
      'src/components/admin/__tests__/EventLinkedPolls.test.js',
      'src/components/admin/__tests__/StaffEventForm.operations.test.js',
      'src/components/admin/__tests__/StaffEventInviteePanel.test.js',
      'src/utils/__tests__/eventOperations.test.js',
      'src/utils/__tests__/companyEventRsvpEvents.test.js',
      'src/utils/__tests__/companyEventInvitationHost.test.js',
      'src/utils/__tests__/publicBrowserBranding.test.js',
      'src/utils/__tests__/sharePreview.test.js',
      'src/utils/__tests__/loginHandoff.test.js',
      'src/utils/__tests__/completePasswordTokenLogin.portal.test.js',
      'src/views/public/__tests__/CompanyEventStaffView.test.js',
      'src/views/public/__tests__/CompanyEventPublicView.test.js',
      'src/views/admin/__tests__/PlatformChatsView.eventLink.test.js',
      'src/components/events/__tests__/EventConversation.test.js',
      'src/views/public/__tests__/CompanyEventRsvpView.test.js',
      'src/components/dashboard/__tests__/StaffPollsPanel*.test.js',
      'src/components/dashboard/__tests__/InvitedEventsPanel.test.js',
      'src/components/dashboard/__tests__/DashboardWork.test.js',
      'src/components/dashboard/__tests__/OverviewEventsCard.training.test.js',
      'src/composables/__tests__/useDashboardOverview.events.test.js',
      'src/utils/__tests__/companyEventStaffing.test.js',
      'src/components/messages/__tests__/StartConversationModal.test.js',
      'src/components/messages/__tests__/MessageThreadList.test.js',
      'src/components/notifications/__tests__/CompanyEventAnnouncements.test.js',
      'src/components/events/__tests__/CompanyEventRsvpControls.test.js',
      'src/components/schedule/__tests__/CompanyEventsCalendarModal.test.js',
      'src/components/schedule/__tests__/scheduleCompanyEventInvitations.test.js',
      'src/components/schedule/__tests__/scheduleDayLayout.test.js',
      'src/components/schedule/__tests__/scheduleLoading.test.js',
      'src/views/__tests__/StaffEventView.test.js'
    ],
    restoreMocks: true
  }
});
