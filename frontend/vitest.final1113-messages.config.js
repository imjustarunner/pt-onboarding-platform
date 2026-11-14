import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',include:[
 'src/components/guardian/__tests__/GuardianSecureConversations.test.js',
 'src/components/guardian/__tests__/GuardianSupportSelection.test.js',
 'src/components/guardian/__tests__/FamilyPortalRefinement.test.js',
 'src/components/guardian/__tests__/FamilyPortalNavigation.test.js'
]}});
