import {it,expect} from 'vitest';
import {paymentDateTime} from '../paymentDateTime';
it('shows the actual payment instant in Denver with time and the date-specific daylight offset',()=>{expect(paymentDateTime('2026-11-17T16:32:05Z')).toMatch(/Nov 17, 2026.*9:32:05 AM MST/);expect(paymentDateTime('2026-07-17T16:32:05Z')).toMatch(/10:32:05 AM MDT/);expect(paymentDateTime(null)).toBe('Not recorded');});
