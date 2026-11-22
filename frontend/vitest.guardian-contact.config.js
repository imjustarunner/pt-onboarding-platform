import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue({template:{transformAssetUrls:{includeAbsolute:false}}})],
  test: { environment: 'jsdom', include: [
    'src/components/admin/__tests__/ClientGuardianContactEditor.test.js',
    'src/components/admin/__tests__/GuardianContactCard.test.js',
    'src/components/admin/__tests__/GuardianFamilyWorkspace.test.js',
    'src/components/admin/__tests__/GuardianRelationshipRestore.test.js',
    'src/composables/__tests__/useGuardianClientSearch.test.js'
  ] }
});
