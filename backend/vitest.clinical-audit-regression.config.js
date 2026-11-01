import core from './vitest.qa-core-repairs.config.js';
import contacts from './vitest.clinical-audit-followup.config.js';
import audit from './vitest.audit-review.config.js';
import messages from './vitest.message-routing-followup.config.js';
import materials from './vitest.session-materials.config.js';
import progress from './vitest.goal-progress.config.js';
import recipients from './vitest.affiliated-reminder-followup.config.js';
export default { ...core, test: { ...core.test, include: [...new Set([core,contacts,audit,messages,materials,progress,recipients].flatMap(config => config.test.include))] } };
