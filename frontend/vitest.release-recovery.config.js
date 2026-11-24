import base from './vitest.provider-experience.config.js';
import {mergeConfig} from 'vitest/config';
export default mergeConfig(base,{test:{include:[...base.test.include,
 'src/components/provider/__tests__/ProviderCopayAttendance.test.js',
 'src/utils/__tests__/sessionRecurrenceLabel.test.js',
 'src/components/schedule/__tests__/AppointmentStaffTools.test.js',
 'src/components/schedule/__tests__/AppointmentInfoPanel.policy.test.js',
 'src/components/schedule/__tests__/officeSessionBookingFlow.test.js',
 'src/components/clinical/__tests__/ClinicalAppointmentAlertGate.test.js',
 'src/components/admin/__tests__/ClientUpdateModal.test.js',
 'src/components/admin/__tests__/ClientReminderTextConsent.test.js',
 'src/components/guardian/__tests__/ClientUpdateChecklist.test.js',
 'src/components/guardian/__tests__/PortalMessageAlert.test.js',
 'src/components/billing/__tests__/FamilyLedgerPanel.test.js',
 'src/components/clinical/__tests__/OutcomeMeasures.test.js'
]}});
