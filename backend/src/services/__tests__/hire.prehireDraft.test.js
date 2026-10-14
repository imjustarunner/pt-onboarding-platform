import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:db}));
import {getPrehireDraft,savePrehireDraft,sanitizePrehireDraft} from '../prehireDraft.service.js';
beforeEach(()=>vi.clearAllMocks());
describe('persisted pre-hire drafts',()=>{
 it('keeps work but does not restore review approval or invitations',()=>{
  expect(sanitizePrehireDraft({contract:{minHours:6},contractReviewed:true,contractPreview:'html',invitationToken:'secret',extraFiles:[{id:1,name:'resume.pdf',title:'Resume',file:{bytes:'data'}}]})).toEqual({contract:{minHours:6},extraFiles:[{id:1,name:'resume.pdf',title:'Resume'}]});
  expect(()=>sanitizePrehireDraft({contractOverrides:{note:'x'.repeat(200001)}})).toThrow('too large');
 });
 it('loads progress only for the agency and candidate requested',async()=>{
  db.execute.mockResolvedValue([[{draft_json:'{"contract":{"minHours":6}}',revision:3}]]);
  expect(await getPrehireDraft(2,8)).toMatchObject({draft:{contract:{minHours:6}},revision:3});
  expect(db.execute.mock.calls[0][1]).toEqual([2,8]);
 });
 it('creates a first draft and rejects competing first saves',async()=>{
  const args={agencyId:2,candidateUserId:8,userId:9,revision:0,draft:{contract:{minHours:6}}};
  db.execute.mockResolvedValue([{affectedRows:1}]);expect(await savePrehireDraft(args)).toEqual({revision:1});
  db.execute.mockRejectedValue({code:'ER_DUP_ENTRY'});await expect(savePrehireDraft(args)).rejects.toMatchObject({status:409});
 });
 it('increments the saved revision and never overwrites a newer window',async()=>{
  const args={agencyId:2,candidateUserId:8,userId:9,revision:3,draft:{contract:{minHours:8}}};
  db.execute.mockResolvedValue([{affectedRows:1}]);expect(await savePrehireDraft(args)).toEqual({revision:4});
  expect(db.execute.mock.calls[0][1].slice(-3)).toEqual([2,8,3]);
  db.execute.mockResolvedValue([{affectedRows:0}]);await expect(savePrehireDraft(args)).rejects.toMatchObject({status:409});
 });
});
