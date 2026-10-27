import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../services/providerDayCancellation.service.js',()=>({default:{}}));
vi.mock('../appointment.controller.js',()=>({assertAppointmentChangeAccess:vi.fn()}));
import pool from '../../config/database.js';
import { authorizeDayCancellation } from '../providerDayCancellation.controller.js';
let assigned;
beforeEach(()=>{assigned=false;pool.execute.mockImplementation(async sql=>[sql.includes('FROM supervisor_assignments')?(assigned?[{id:1}]:[]):[{id:7,user_id:7}]]);});
it.each(['admin','super_admin','superadmin','support'])('allows authorized %s in the provider agency',async role=>{await expect(authorizeDayCancellation({id:9,role},7,[2])).resolves.toBeUndefined();});
it('allows the provider and their assigned supervisor, but denies unrelated providers',async()=>{
 await expect(authorizeDayCancellation({id:7,role:'provider'},7,[2])).resolves.toBeUndefined();
 await expect(authorizeDayCancellation({id:9,role:'provider'},7,[2])).rejects.toMatchObject({status:403});
 assigned=true;await expect(authorizeDayCancellation({id:9,role:'provider',has_supervisor_privileges:true},7,[2])).resolves.toBeUndefined();
});
it('does not grant supervisors access to another agency or guardians access to cancel days',async()=>{
 assigned=true;pool.execute.mockResolvedValueOnce([[{id:7}]]).mockResolvedValueOnce([[]]);
 await expect(authorizeDayCancellation({id:9,role:'supervisor'},7,[3])).rejects.toMatchObject({status:403});
 await expect(authorizeDayCancellation({id:9,role:'guardian'},7,[2])).rejects.toMatchObject({status:403});
});
