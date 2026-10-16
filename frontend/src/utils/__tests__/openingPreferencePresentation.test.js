import { describe, it, expect } from 'vitest';
import { openingPreferencePresentation } from '../openingPreferencePresentation';
const opening={startAt:'2030-01-07T02:00:00Z',endAt:'2030-01-07T03:00:00Z',timeZone:'America/Denver',modality:'VIRTUAL',frequency:'WEEKLY'};
describe('preferred opening summaries',()=>{
 it('uses the opening timezone for both the day and time, including across UTC midnight',()=>{
  expect(openingPreferencePresentation(opening)).toMatchObject({date:'Sunday, January 6, 2030',time:'7:00 PM – 8:00 PM',frequency:'Weekly',setting:'Virtual',timeZone:'America/Denver'});
 });
 it('supports Spanish and the assigned office without displaying raw frequency codes',()=>{
  const summary=openingPreferencePresentation({...opening,modality:'IN_PERSON',buildingName:'Windchime',frequency:'BIWEEKLY'},'es');
  expect(summary.date).toContain('domingo');expect(summary.date).toContain('enero');expect(summary.frequency).toBe('Cada 2 semanas');expect(summary.setting).toBe('Windchime');
 });
 it('hides missing or invalid times and safely handles an unknown timezone',()=>{
  expect(openingPreferencePresentation(null)).toBeNull();expect(openingPreferencePresentation({...opening,endAt:'invalid'})).toBeNull();expect(openingPreferencePresentation({...opening,endAt:opening.startAt})).toBeNull();
  expect(openingPreferencePresentation({...opening,timeZone:'Unknown/Zone'}).timeZone).toBe('America/Denver');
 });
});
