import base from './vitest.avery-demo.config.js';
import { mergeConfig } from 'vitest/config';
export default mergeConfig(base, { test: { include: [
  ...base.test.include,
  'src/components/dashboard/__tests__/DashboardLearningTips.test.js',
  'src/components/dashboard/__tests__/BriefingSecurityCard.test.js',
  'src/composables/__tests__/useDashboardOverview.loading.test.js',
  'src/composables/__tests__/useDashboardOverview.events.test.js',
  'src/components/admin/__tests__/PrivilegedLoginBriefingWorkspace.test.js',
  'src/services/__tests__/schoolAgencyWorkspace.test.js',
  'src/services/__tests__/workspaceNavigation.test.js',
  'src/views/school/__tests__/SchoolCareBridgeAgencyWorkspace.test.js',
  'src/utils/__tests__/providerAgenda.test.js',
  'src/components/school/__tests__/SchoolRosterAccess.test.js'
] } });
