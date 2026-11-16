import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../clinicalNoteVersionBilling.service.js',()=>({getApprovedClinicalContext:async context=>context}));
import {resolveLinkedServiceBilling,linkedServiceLineBlockers} from '../../../../frontend/src/navigation/linkedServiceBilling.js';
import {resolveSessionBilling,resolveWithOverflowChain} from '../serviceCodeUnits.service.js';
import {resolveNoteAidBillingCodes} from '../../utils/noteAidBillingAddons.js';
import {populateLinkedSessionClaim} from '../linkedServiceClaimLines.service.js';
describe('documented eligible minutes produce parent and linked add-on lines',()=>{
 it('keeps the manual’s ET mobile-crisis protocol separate from outpatient 90840 automation',()=>{
  expect(resolveLinkedServiceBilling('90839',200,{modifiers:['ET']})).toBeNull();
  expect(linkedServiceLineBlockers([{procedure_code:'90839',units:1,modifiers_json:'["ET"]'},{procedure_code:'90840',units:5}],200,'90839').join(' ')).toContain('mobile crisis');
 });
 it.each([[31,0],[74,0],[75,1],[104,1],[105,2],[164,3],[165,4],[194,4],[195,5],[200,5],[224,5],[225,6]])('crisis at %i minutes has %i add-on units',(minutes,addons)=>{
  const result=resolveSessionBilling({minutes,serviceCode:'90839',unitCalcMode:'SINGLE'});expect(result).toMatchObject({claimable:true,units:1,addons:addons?[{code:'90840',units:addons}]:[]});expect(resolveNoteAidBillingCodes({primaryCode:'90839',durationMinutes:minutes}).addons).toEqual(result.addons);
 });
 it.each([['96116','96121',31,91,60],['96130','96131',31,91,60],['96132','96133',31,91,60],['96136','96137',16,46,30],['96138','96139',16,46,30]])('%s uses only its corresponding %s add-on',(parent,addon,min,start,increment)=>{
  expect(resolveLinkedServiceBilling(parent,min-1).claimable).toBe(false);expect(resolveLinkedServiceBilling(parent,start-1).addons).toEqual([]);
  expect(resolveLinkedServiceBilling(parent,start)).toMatchObject({units:1,addons:[{code:addon,units:1}]});expect(resolveLinkedServiceBilling(parent,start+increment).addons).toEqual([{code:addon,units:2}]);
  expect(resolveSessionBilling({serviceCode:addon,minutes:200}).claimable).toBe(false);
 });
 it('blocks orphan add-ons, duplicate lines, and wrong duration units',()=>{
  expect(linkedServiceLineBlockers([{procedure_code:'90840',units:5}],200,'90839')).not.toHaveLength(0);
  const correct=[{procedure_code:'90839',units:1},{procedure_code:'90840',units:5}];expect(linkedServiceLineBlockers(correct,200,'90839')).toEqual([]);
  expect(linkedServiceLineBlockers([...correct,{procedure_code:'90840',units:1}],200,'90839')).not.toHaveLength(0);
  expect(linkedServiceLineBlockers(correct,74,'90839')).not.toHaveLength(0);
 });
 it('requires the linked add-on to be enabled in the catalog',()=>expect(resolveWithOverflowChain(200,{serviceCode:'90839'},()=>null)).toMatchObject({claimable:false,reason:expect.stringContaining('90840')}));
 it('expands the initial empty claim from signed minutes without changing the signed note',async()=>{
  const note={metadata_json:{serviceCode:'90839',durationMinutes:200}},claim={claim_lifecycle:'draft',date_of_service:'2026-11-16'};
  const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),execute:vi.fn(async sql=>sql.includes('SELECT * FROM clinical_claims')?[[claim]]:sql.includes('SELECT * FROM clinical_claim_lines')?[[{id:9,procedure_code:'90839',units:1,charge_cents:0}]]:sql.includes('SELECT * FROM clinical_notes')?[[note]]:sql.includes('SELECT * FROM clinical_sessions')?[[{service_code:'90839',duration_minutes:200}]]:[{affectedRows:1}])};
  expect(await populateLinkedSessionClaim({agencyId:2,claimId:3,noteId:4,sessionId:5},db)).toBe(true);
  const insert=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO clinical_claim_lines'));expect(insert[1]).toEqual([3,2,'90840',5,'2026-11-16',4]);expect(db.execute.mock.calls.some(([sql])=>/UPDATE clinical_notes|DELETE/.test(sql))).toBe(false);expect(db.commit).toHaveBeenCalled();
  claim.claimmd_submitted_at='2026-11-16';db.execute.mockClear();expect(await populateLinkedSessionClaim({agencyId:2,claimId:3,noteId:4,sessionId:5},db)).toBe(false);expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
 });
});
