import {expect,it} from 'vitest';
import {clinicalClock,clinicalTimestamp,clinicalNarrativeDisplay} from '../clinicalDisplay.js';
it('shows Denver timestamps in 12-hour time across daylight saving and UTC calendar boundaries',()=>{
 expect(clinicalTimestamp('2026-11-06T01:23:48.000Z')).toBe('Nov 5, 2026, 6:23 PM MST');
 expect(clinicalTimestamp('2026-07-06 01:23:48')).toBe('Jul 5, 2026, 7:23 PM MDT');
 expect(clinicalClock('18:13')).toBe('6:13 PM');expect(clinicalClock('00:00')).toBe('12:00 AM');expect(clinicalClock('12:00')).toBe('12:00 PM');
});
it('only reformats the generated screening time labels and preserves all original narrative bytes',()=>{
 const original='Digital questionnaire submitted: 2026-11-06T01:23:48.000Z (source timestamp)\nService time: 18:13–18:23 America/Denver; duration: 10 minutes.\nClient reported a clock reading 18:13.';
 const shown=clinicalNarrativeDisplay(original);expect(shown).toContain('Nov 5, 2026, 6:23 PM MST');expect(shown).toContain('Service time: 6:13 PM–6:23 PM America/Denver; duration: 10 minutes.');expect(shown).toContain('Client reported a clock reading 18:13.');expect(original).toContain('2026-11-06T01:23:48.000Z');
});
