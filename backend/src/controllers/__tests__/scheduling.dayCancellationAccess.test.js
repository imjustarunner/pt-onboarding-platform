import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../services/providerDayCancellation.service.js',()=>({default:{}}));
vi.mock('../appointment.controller.js',()=>({assertAppointmentChangeAccess:vi.fn()}));
import pool from '../../config/database.js';
vi.mock('../../services/cancellationEmailPreview.service.js',()=>({previewCancellationEmail:vi.fn(async()=>({html:'<p>Preview</p>'}))}));
import { previewCancellationEmail } from '../../services/cancellationEmailPreview.service.js';
import { authorizeDayCancellation, listDayCancellationAgencies, previewDayCancellationEmail } from '../providerDayCancellation.controller.js';

let assignments;
beforeEach(() => {
  assignments = [];
  pool.execute.mockImplementation(async (_sql, [providerId, allAgencies, actorId, canManage, supervisorId]) => {
    const memberships = providerId === 7 ? [2, 4] : [];
    const actorAgencies = actorId === 7 ? [2, 4] : [2, 3];
    return [memberships.filter(id => (allAgencies || actorAgencies.includes(id))
      && (canManage || (supervisorId === 9 && assignments.includes(id)))).map(id => ({ id, name: `Agency ${id}` }))];
  });
});

it.each(['admin', 'support', 'scheduler', 'front_desk'])('allows %s within their own agency scope', async role => {
  await expect(authorizeDayCancellation({ id: 9, role }, 7, [2])).resolves.toBeUndefined();
  await expect(authorizeDayCancellation({ id: 9, role }, 7, [2, 4])).rejects.toMatchObject({ status: 403 });
});
it.each(['super_admin', 'superadmin'])('allows %s across the provider memberships, including on their own schedule', async role => {
  await expect(authorizeDayCancellation({ id: 9, role }, 7, [2, 4])).resolves.toBeUndefined();
  await expect(authorizeDayCancellation({ id: 7, role }, 7, [2, 4])).resolves.toBeUndefined();
  await expect(authorizeDayCancellation({ id: 9, role }, 7, [2, 3])).rejects.toMatchObject({ status: 403 });
});
it('allows self and assigned supervisors, and denies unrelated providers and guardians', async () => {
  await expect(authorizeDayCancellation({ id: 7, role: 'provider' }, 7, [2, 4])).resolves.toBeUndefined();
  await expect(authorizeDayCancellation({ id: 9, role: 'provider' }, 7, [2])).rejects.toMatchObject({ status: 403 });
  assignments = [2, 4];
  await expect(authorizeDayCancellation({ id: 9, role: 'provider' }, 7, [2])).resolves.toBeUndefined();
  await expect(authorizeDayCancellation({ id: 9, role: 'provider' }, 7, [4])).rejects.toMatchObject({ status: 403 });
  await expect(authorizeDayCancellation({ id: 7, role: 'guardian' }, 7, [2])).rejects.toMatchObject({ status: 403 });
});
it('lists only the agencies a scheduler may cancel for that provider', async () => {
  const res = { set: vi.fn(), json: vi.fn() };
  await listDayCancellationAgencies({ user: { id: 9, role: 'scheduler' }, params: { providerId: '7' } }, res, vi.fn());
  expect(res.json).toHaveBeenCalledWith({ agencies: [{ id: 2, name: 'Agency 2' }] });
});

it('previews email only inside the provider and agency scope without sending or canceling',async()=>{
 const res={set:vi.fn(),json:vi.fn(),status:vi.fn(function(){return this;})},next=vi.fn();
 await previewDayCancellationEmail({user:{id:7,role:'provider'},params:{providerId:'7'},body:{agencyId:2,subject:'Subject',text:'Draft'}},res,next);
 expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(res.json).toHaveBeenCalledWith({html:'<p>Preview</p>'});
 previewCancellationEmail.mockClear();
 await previewDayCancellationEmail({user:{id:9,role:'provider'},params:{providerId:'7'},body:{agencyId:4,subject:'Subject',text:'Draft'}},res,next);
 expect(res.status).toHaveBeenCalledWith(403);expect(previewCancellationEmail).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled();
});
