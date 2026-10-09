import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{include:['src/navigation/__tests__/providerUpdateInvitation.test.js','src/components/communications/__tests__/AdminUpdateEditorLink.test.js']}});
