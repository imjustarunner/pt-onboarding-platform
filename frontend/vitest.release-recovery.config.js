import base from './vitest.provider-experience.config.js';
import {mergeConfig} from 'vitest/config';
export default mergeConfig(base,{test:{include:[...base.test.include,
 'src/components/admin/__tests__/ClientUpdateModal.test.js',
 'src/components/admin/__tests__/ClientReminderTextConsent.test.js',
 'src/components/guardian/__tests__/ClientUpdateChecklist.test.js',
 'src/components/guardian/__tests__/PortalMessageAlert.test.js',
 'src/components/billing/__tests__/FamilyLedgerPanel.test.js',
 'src/components/clinical/__tests__/OutcomeMeasures.test.js'
]}});
