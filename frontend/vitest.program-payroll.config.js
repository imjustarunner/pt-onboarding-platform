import {mergeConfig} from 'vite';
import config from './vite.config.js';
export default mergeConfig(config,{test:{include:[
  "src/components/billing/__tests__/MissedSessionFeesPanel.test.js",
  "src/components/learning/__tests__/GroupClassSessionPayroll.test.js",
  "src/components/payroll/__tests__/PayrollActualHoursReview.test.js",
  "src/components/schedule/__tests__/AppointmentLearningWorkspace.test.js",
  "src/utils/__tests__/payrollPaySummary.test.js"
]}});
