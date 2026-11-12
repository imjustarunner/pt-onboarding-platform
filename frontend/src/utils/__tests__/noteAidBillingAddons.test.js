import { describe, expect, it } from 'vitest';
import {
  resolveCrisis90839Billing,
  resolveExtendedEncounter90837,
  resolveNoteAidBillingCodes,
  isEligibleFor90785,
  shouldSuggest99051
} from '../noteAidBillingAddons.js';

import {evaluate99051Schedule as serverSchedule} from '../../../../backend/src/utils/clinicalAfterHoursPolicy.js';
import {isProBonoFunding as serverFunding} from '../../../../backend/src/utils/clinicalFundingPolicy.js';

describe('90839 crisis billing', () => {
  it('switches to 90832 when duration is 30 or less', () => {
    const r = resolveCrisis90839Billing({ durationMinutes: 30 });
    expect(r.primaryCode).toBe('90832');
    expect(r.switchedFrom).toBe('90839');
    expect(r.addons).toEqual([]);
  });

  it('keeps 90839 without 90840 under 75 minutes', () => {
    const r = resolveCrisis90839Billing({ durationMinutes: 74 });
    expect(r.primaryCode).toBe('90839');
    expect(r.addons).toEqual([]);
  });

  it('adds one 90840 at 75–104 minutes', () => {
    expect(resolveCrisis90839Billing({ durationMinutes: 75 }).addons).toEqual([
      { code: '90840', units: 1 }
    ]);
    expect(resolveCrisis90839Billing({ durationMinutes: 90 }).addons).toEqual([
      { code: '90840', units: 1 }
    ]);
  });

  it('adds two 90840 at 105–134 minutes', () => {
    expect(resolveCrisis90839Billing({ durationMinutes: 105 }).addons).toEqual([
      { code: '90840', units: 2 }
    ]);
    expect(resolveCrisis90839Billing({ durationMinutes: 135 }).addons).toEqual([
      { code: '90840', units: 3 }
    ]);
  });
});

describe('90837 extended encounter', () => {
  it('bills 90834 × 2 after 74 minutes and blocks 90785', () => {
    const r = resolveExtendedEncounter90837({
      durationMinutes: 75,
      includeInteractiveComplexity: true
    });
    expect(r.primaryCode).toBe('90834');
    expect(r.primaryUnits).toBe(2);
    expect(r.isExtendedEncounter).toBe(true);
    expect(r.allow90785).toBe(false);
  });
});

describe('90785 eligibility', () => {
  it('allows with 90834 single unit but not extended encounter', () => {
    expect(isEligibleFor90785('90834', { isExtendedEncounter: false })).toBe(true);
    expect(isEligibleFor90785('90834', { isExtendedEncounter: true })).toBe(false);
    expect(isEligibleFor90785('90837')).toBe(true);
    expect(isEligibleFor90785('90839')).toBe(false);
  });
});

describe('resolveNoteAidBillingCodes', () => {
  it('combines 90839 duration switch with after-hours only when opted in', () => {
    const weekend = new Date('2026-09-05T10:00:00Z'); // Saturday
    const r = resolveNoteAidBillingCodes({
      primaryCode: '90839',
      durationMinutes: 90,
      includeAfterHours99051: false,
      sessionStartAt: weekend,
      timeZone: 'America/Denver'
    });
    expect(r.primaryCode).toBe('90839');
    expect(r.addons.some((a) => a.code === '90840' && a.units === 1)).toBe(true);
    expect(r.addons.some((a) => a.code === '99051')).toBe(false);

    const with99051 = resolveNoteAidBillingCodes({
      primaryCode: '90839',
      durationMinutes: 90,
      includeAfterHours99051: true,
      sessionStartAt: weekend,
      timeZone: 'America/Denver'
    });
    expect(with99051.addons.some((a) => a.code === '99051')).toBe(true);
  });

  it('drops 90785 on extended 90837', () => {
    const r = resolveNoteAidBillingCodes({
      primaryCode: '90837',
      durationMinutes: 90,
      includeInteractiveComplexity: true
    });
    expect(r.primaryCode).toBe('90834');
    expect(r.primaryUnits).toBe(2);
    expect(r.addons.some((a) => a.code === '90785')).toBe(false);
  });
});

describe('99051 after hours', () => {
  it('qualifies only weekday evening or weekend starts using the explicit saved timezone', () => {
    const zone={timeZone:'America/Denver'};
    expect(shouldSuggest99051('2026-11-09T14:30:00Z',zone)).toBe(false);
    expect(shouldSuggest99051('2026-11-09T23:59:00Z',zone)).toBe(false);
    expect(shouldSuggest99051('2026-11-10T00:00:00Z',zone)).toBe(true);
    expect(shouldSuggest99051('2026-11-07T19:00:00Z',zone)).toBe(true);
    expect(shouldSuggest99051('2026-11-09 22:00:00',{timeZone:'America/New_York'})).toBe(true);
    expect(shouldSuggest99051('2026-11-09 22:00:00',zone)).toBe(false);
  });
  it.each([{},{timeZone:'invalid/zone'}])('rejects missing/unverified timezones even for weekend instants', options => {
    expect(shouldSuggest99051('2026-11-07T19:00:00Z',options)).toBe(false);
    expect(resolveNoteAidBillingCodes({primaryCode:'90837',durationMinutes:60,includeAfterHours99051:true,sessionStartAt:'2026-11-07T19:00:00Z',...options}).addons).not.toContainEqual({code:'99051',units:1});
  });
  it('rejects a forced morning toggle while preserving authored interactive complexity', () => {
    const result=resolveNoteAidBillingCodes({primaryCode:'90837',durationMinutes:60,includeInteractiveComplexity:true,includeAfterHours99051:true,sessionStartAt:'2026-11-09T14:30:00Z',timeZone:'America/Denver'});
    expect(result.addons).toEqual([{code:'90785',units:1}]);expect(result.warnings.join(' ')).toContain('99051 was not added');
  });
  it.each([{primaryCode:'PRO-BONO SERVICE'},{primaryCode:'90837',metadata:{fundingDisposition:'pro_bono'}}])('does not add an automatic charge to Pro Bono funding', funding => {
    expect(resolveNoteAidBillingCodes({...funding,durationMinutes:60,includeAfterHours99051:true,sessionStartAt:'2026-11-10T00:00:00Z',timeZone:'America/Denver'}).addons).not.toContainEqual({code:'99051',units:1});
  });
});

describe('frontend/backend automatic after-hours policy parity',()=>{
  it('uses the same saved-source policy across source zones, DST boundaries, invalid sources and funding',()=>{
    const starts=['2026-10-28T14:59:00Z','2026-10-28T23:00:00Z','2026-11-09T23:59:00Z','2026-11-10T00:00:00Z','2026-11-07T07:00:00Z','2026-11-09T06:59:00Z','2026-11-01T07:30:00Z','2026-11-01T08:30:00Z','2026-11-09 22:00:00','2026-11-09','invalid'];
    for(const timeZone of [undefined,'invalid/zone','America/Denver','America/New_York','UTC'])for(const startAt of starts){expect(shouldSuggest99051(startAt,{timeZone})).toBe(serverSchedule({startAt,timeZone}).eligible);}
    for(const funding of [{serviceCode:'90837'},{serviceCode:'PRO-BONO SERVICE'},{serviceCode:'PRO_BONO_SERVICE'},{serviceCode:'pro bono'},{serviceCode:'90837',metadata:{fundingDisposition:'pro_bono'}},{serviceCode:'90837',metadata:{billingDisposition:'pro_bono'}},{serviceCode:'90837',metadata:{billing_disposition:'pro_bono'}},{serviceCode:'90837',metadata:{contactBillingDisposition:'pro_bono'}},{serviceCode:'90837',metadata:{contactMeta:JSON.stringify({billing_disposition:'pro_bono'})}}]){expect(shouldSuggest99051('2026-11-10T00:00:00Z',{timeZone:'America/Denver',primaryCode:funding.serviceCode,metadata:funding.metadata})).toBe(!serverFunding(funding));}
  });
});

describe('H0004 canonical note preview units',()=>{
 it.each([[30,2],[38,3],[53,4],[60,4],[67,4],[68,5]])('retains H0004 at%s actual minutes with%s units and review only above67',(minutes,units)=>{const result=resolveNoteAidBillingCodes({primaryCode:'H0004',durationMinutes:minutes});expect(result.primaryCode).toBe('H0004');expect(result.primaryUnits).toBe(units);expect(result.billingReviewRequired).toBe(minutes>=68);expect(result.switchedFrom).toBeNull();if(minutes>=68)expect(result.warnings.join(' ')).toContain('review billing before submitting a claim');});
 it('does not invent one unit below the eight-minute minimum',()=>{expect(resolveNoteAidBillingCodes({primaryCode:'H0004',durationMinutes:7})).toMatchObject({primaryUnits:0,billingReviewRequired:false});});
});
