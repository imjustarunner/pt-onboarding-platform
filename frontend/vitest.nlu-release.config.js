import intake from './vitest.nlu-intake-repair.config.js';
import workspace from './vitest.nlu-workspace.config.js';
import childcare from './vitest.nlu-childcare.config.js';
export default { ...intake, root: new URL('.', import.meta.url).pathname, test: { ...intake.test, restoreMocks: true, include: [...new Set([...intake.test.include, ...workspace.test.include, ...childcare.test.include])] } };
