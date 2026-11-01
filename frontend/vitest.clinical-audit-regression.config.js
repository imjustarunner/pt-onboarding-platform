import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import calendar from './vitest.qa-clinical-calendar.config.js';
import clinical from './vitest.qa-pm-clinical.config.js';
import guardians from './vitest.guardian-contact-sharing.config.js';
import audit from './vitest.audit-review.config.js';
import messages from './vitest.message-routing-followup.config.js';
import materials from './vitest.session-materials.config.js';
import progress from './vitest.goal-progress.config.js';
import contacts from './vitest.contact-reminder-followup.config.js';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], resolve: { alias: { '@': new URL('./src',import.meta.url).pathname } }, test: { environment: 'jsdom', restoreMocks: true,
include: [...new Set([calendar,clinical,guardians,audit,messages,materials,progress,contacts].flatMap(config => config.test.include))] } });
