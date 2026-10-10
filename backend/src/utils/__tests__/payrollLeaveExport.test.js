import { expect, it } from 'vitest';
import { appliedLeaveExportHours } from '../payrollLeaveExport.js';

it('exports the approved split from the run rather than later adjustments', () => {
  expect(appliedLeaveExportHours({ sickPtoHours: 2, trainingPtoHours: 3, ptoHours: 5 },
    { sick_pto_hours: 8, training_pto_hours: 9 })).toEqual({ sickHours: 2, trainingHours: 3, totalHours: 5 });
});
it('does not turn school support taxable pay into sick hours', () => {
  expect(appliedLeaveExportHours(null, { other_taxable_amount: 180 })).toEqual({ sickHours: 0, trainingHours: 0, totalHours: 0 });
});
it('respects an explicitly zero run instead of exporting later approvals', () => {
  expect(appliedLeaveExportHours({ sickPtoHours: 0, trainingPtoHours: 0, ptoHours: 0 },
    { sick_pto_hours: 8 })).toEqual({ sickHours: 0, trainingHours: 0, totalHours: 0 });
});
it('keeps adjustment-only training separate and preserves historical unsplit PTO', () => {
  expect(appliedLeaveExportHours(null, { training_pto_hours: '4', pto_hours: '4' })).toEqual({ sickHours: 0, trainingHours: 4, totalHours: 4 });
  expect(appliedLeaveExportHours({ ptoHours: 6 })).toEqual({ sickHours: 6, trainingHours: 0, totalHours: 6 });
});
