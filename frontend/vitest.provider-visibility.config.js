import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:[
 'src/components/availability/__tests__/AgencyClientCareToggle.test.js',
 'src/components/availability/__tests__/ProviderAvailabilitySettings.test.js',
 'src/components/publicServices/__tests__/PublicProviderDirectory.test.js',
 'src/views/public/__tests__/PublicMarketingLandingTisiView.test.js',
 'src/views/public/__tests__/PublicCareersEmptyState.test.js',
 'src/views/public/__tests__/TisiAudiencePage.test.js',
 'src/utils/__tests__/publicDomainRouting.test.js'
]}});
