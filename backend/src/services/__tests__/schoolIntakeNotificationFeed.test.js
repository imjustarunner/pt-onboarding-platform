import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { schoolIntakeNotificationFeed } from '../schoolIntakeNotificationFeed.service.js';
it('keeps each child linked without decrypting private answers', async () => {
 const db={execute:vi.fn().mockResolvedValue([[{id:1505,client_id:2470,client_initials:'ARI',full_name:'Ari Synthetic'}, {id:1505,client_id:2471,client_initials:'TEO'}, {id:1505,client_id:2470}, {id:1506,client_id:2472,client_identifier_code:'R002'}]])};
 const rows=await schoolIntakeNotificationFeed({schoolOrganizationId:451,db});
 expect(rows.map(row=>row.client_id)).toEqual([2470,2471,2472]);expect(new Set(rows.map(row=>row.id)).size).toBe(3);
 expect(rows[0]).toMatchObject({client_full_name:'Ari Synthetic',title:'Digital enrollment packet submitted',message:'ARI: enrollment submitted via digital form'});
 const sql=db.execute.mock.calls[0][0];expect(sql).not.toMatch(/payload_|signer_name|intake_data|signature/);expect(sql).toContain('COALESCE(isc.client_id, s.client_id) AS client_id');
});
it('limits provider/supervisor feeds to actual scoped clients',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[]])};await schoolIntakeNotificationFeed({schoolOrganizationId:451,clientIds:[2470,2471],db});
 expect(db.execute.mock.calls[0][0]).toContain('IN (?,?)');expect(db.execute.mock.calls[0][1]).toEqual([451,2470,2471]);db.execute.mockClear();
 expect(await schoolIntakeNotificationFeed({schoolOrganizationId:451,clientIds:[],db})).toEqual([]);expect(db.execute).not.toHaveBeenCalled();
});
