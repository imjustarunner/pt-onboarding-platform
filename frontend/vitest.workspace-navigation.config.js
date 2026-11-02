import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins:[vue()], test:{ environment:'jsdom',include:['src/components/__tests__/WorkspaceNavigation.test.js','src/auricwell/__tests__/Workspace.test.js'] } });
