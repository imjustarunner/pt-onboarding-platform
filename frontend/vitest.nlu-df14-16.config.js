import{defineConfig}from'vitest/config';import vue from'@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:['src/views/__tests__/LoginPortalIsolation.test.js','src/components/guardian/__tests__/FamilyPortalExpansion.test.js','src/utils/__tests__/serviceLegalContext.test.js','src/utils/__tests__/familyPortalContext.test.js']}});
