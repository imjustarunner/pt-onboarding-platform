import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import {fileURLToPath, URL} from 'node:url';
export default defineConfig({plugins:[vue()],resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{environment:'jsdom',setupFiles:['./src/test/setup.js'],include:[
 'src/navigation/__tests__/tutoringEnrollmentPolicy.test.js',
 'src/views/__tests__/PublicIntakeTutoringScope.test.js',
 'src/components/public-intake/__tests__/TutoringPaymentPreferences.test.js',
 'src/components/digital-form/__tests__/PublicEntryLegalFooter.test.js',
 'src/utils/__tests__/contactInput.test.js',
 'src/components/publicServices/__tests__/PublicProviderProfileDetails.test.js',
 'src/components/publicServices/__tests__/TutoringFinderScope.test.js',
 'src/views/__tests__/PublicIntakeGuardianResume.test.js',
 'src/views/__tests__/PublicIntakeOptionalLabels.test.js',
 'src/views/__tests__/PublicIntakeProviderSelection.test.js',
 'src/views/__tests__/PublicIntakeLegalLocale.test.js'
]}});
