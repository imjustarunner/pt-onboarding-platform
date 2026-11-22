import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',include:[
  'src/components/provider/__tests__/ProviderLoginBriefing.loading.test.js',
  'src/components/dashboard/__tests__/ProviderSchoolsPrograms.test.js',
  'src/components/availability/__tests__/ProviderAvailabilityNotice.test.js',
  'src/components/provider/__tests__/ProviderEnrollmentWaitlist.test.js',
  'src/components/meetings/__tests__/DashboardInvitationToasts.test.js',
  'src/utils/__tests__/providerLoginBriefing.test.js',
  'src/utils/__tests__/savedAppointmentCalendar.test.js',
  'src/composables/__tests__/useAppReminderSnooze.test.js',
  'src/components/schedule/__tests__/AveryDemoSchedule.test.js'
]}});
