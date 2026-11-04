import { it,expect } from 'vitest';
import { formatBillingDate,formatBillingTimestamp } from '../billingReviewDisplay.js';
it('keeps service dates unchanged and formats UTC audit time in Denver, including DST',()=>{
 expect(formatBillingDate('2026-11-02T00:00:00Z')).toBe('11/02/2026');
 expect(formatBillingTimestamp('2026-11-04T20:17:33.000Z')).toBe('11/04/2026, 1:17 PM MST');
 expect(formatBillingTimestamp('2026-07-04 20:17:33')).toBe('07/04/2026, 2:17 PM MDT');
 expect(formatBillingTimestamp('invalid')).toBe('Time unavailable');
});
