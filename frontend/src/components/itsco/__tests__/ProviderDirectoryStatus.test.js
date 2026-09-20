import {describe,it,expect} from 'vitest';
import {providerPriority,providerStatuses,overallProviderStatus} from '../../../utils/providerDirectoryStatus';
const person=(id,details={},extra={})=>({id,displayName:String(id),acceptingNewClients:true,office:true,schools:[],details,...extra});
describe('public directory availability order',()=>{
 it('ranks all formats, office/virtual, their waitlists, school openings, school waitlists, and closed',()=>{
  const rows=[person(6,{}, {acceptingNewClients:false}),person(5,{schoolAvailability:'waitlist'},{office:false,schools:[{}],acceptingNewClients:false}),person(4,{}, {office:false,schools:[{}],schoolOpenings:true,acceptingNewClients:false}),person(3,{officeAvailability:'waitlist'}),person(2),person(1,{virtualEnabled:true},{schools:[{}],schoolOpenings:true})];
  expect(rows.sort((a,b)=>providerPriority(a)-providerPriority(b)).map(p=>p.id)).toEqual([1,2,3,4,5,6]);
 });
 it('new publications override global closure and disabled format flags',()=>{
  const p=person(1,{virtualEnabled:false},{acceptingNewClients:false});
  const availability={virtual:{hasPublishedOpenings:true}};
  expect(providerStatuses(p,availability).virtual).toBe('accepting');
  expect(overallProviderStatus(p,availability)).toBe('accepting');
  expect(overallProviderStatus(p)).toBe('unavailable');
 });
 it('school filtering uses openings in the chosen school, not another school',()=>{
  const p=person(1,{}, {office:false,acceptingNewClients:false,schools:[{id:1,hasOpenings:true},{id:2,hasOpenings:false}],schoolOpenings:true});
  expect(providerStatuses(p,{},'1').school).toBe('accepting');expect(providerStatuses(p,{},'2').school).toBe('unavailable');
 });
});
