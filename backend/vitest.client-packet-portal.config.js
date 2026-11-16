import chart from './vitest.chart-import.config.js';
import paper from './vitest.paper-followup.config.js';
import management from './vitest.client-management-needs.config.js';
import transition from './vitest.client-transition-settings.config.js';
import guest from './vitest.guest-invoices.config.js';
export default { ...chart, test:{ environment:'node', restoreMocks:true,
  include:['src/services/__tests__/clientPacketPortalReadiness.test.js',...new Set([chart,paper,management,transition,guest].flatMap(config=>config.test.include))]
} };
