import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import Task from '../Task.model.js';
it.each(['2488','#2488','4396','2544'])('includes exact bound task/source references for %s without changing visibility predicates',q=>{
 const base='SELECT t.* FROM tasks t WHERE t.assigned_to_agency_id=?';const r=Task._appendHubFilters(base,[450],{q});expect(r.query).toContain(base);expect(r.query).toContain('OR t.id = ?');expect(r.query).toContain("'$.documentId'");expect(r.params.slice(-4)).toEqual(Array(4).fill(q.replace('#','')));expect(r.params[0]).toBe(450);
});
it('keeps arbitrary text bound and does not treat a numeric-looking injection as a reference',()=>{const r=Task._appendHubFilters('SELECT t.* FROM tasks t WHERE 1=1',[],{q:"2488 OR 1=1"});expect(r.query).not.toContain('OR t.id = ?');expect(r.params).toHaveLength(4);});
it('keeps the actual completed paper task, client and source visible when the title uses masked initials',()=>{
 const subtitle=Task._hubSearchSubtitle({id:2488,source_ref_type:'paper_packet_processing',source_ref_id:226,status:'completed',metadata:JSON.stringify({clientId:2544,documentId:4396,schoolName:'Cedar QA'})},'Team');expect(subtitle).toBe('Task #2488 · Client #2544 · Document #4396 · Packet draft #226 · Team · Cedar QA');
});
