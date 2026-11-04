import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins:[vue()], test:{ environment:'jsdom',include:['src/views/assistants/__tests__/*.test.js'],globals:true } });
