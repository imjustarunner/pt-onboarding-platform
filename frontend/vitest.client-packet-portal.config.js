import chart from './vitest.chart-import.config.js';
import paper from './vitest.paper-followup.config.js';
import management from './vitest.client-management-needs.config.js';
import transition from './vitest.client-transition-settings.config.js';
import guest from './vitest.guest-invoices.config.js';
import auth from './vitest.portal-auth-language.config.js';
export default { ...chart, resolve:paper.resolve, test:{ environment:'jsdom', restoreMocks:true,
  include:[...new Set([chart,paper,management,transition,guest,auth].flatMap(config=>config.test.include))]
} };
