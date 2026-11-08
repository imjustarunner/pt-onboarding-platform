import {describe,it,expect} from 'vitest';
import {bookingServiceDuration} from '../bookingServiceDuration.js';
describe('booking service durations',()=>{
  it('uses booking lengths rather than billing minimums',()=>{
    expect(bookingServiceDuration({code:'90832',minDurationMinutes:16,unitMinutes:15})).toBe(30);
    expect(bookingServiceDuration({code:'90834',minDurationMinutes:38})).toBe(45);
    expect(bookingServiceDuration({code:'90837',minDurationMinutes:53})).toBe(60);
  });
  it('preserves configured tenant lengths and does not invent unknown services',()=>{
    expect(bookingServiceDuration({code:'90837',defaultDurationMinutes:55})).toBe(55);
    expect(bookingServiceDuration({code:'CUSTOM',default_duration_minutes:80})).toBe(80);
    expect(bookingServiceDuration({code:'CUSTOM',unitMinutes:15})).toBeNull();
    for(const bad of [-1,0,'',null,3.5,999])expect(bookingServiceDuration({code:'90832',defaultDurationMinutes:bad})).toBe(30);
  });
});
