import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import Client from '../Client.model.js';

const qa = { id: 450, slug: 'auricwell-qa-demo', feature_flags: { qaSandbox: { syntheticOnly: true } } };
async function create(agencyId, agency, requested) {
  const executor = { execute: vi.fn(async sql => sql.startsWith('SELECT') ? [[agency]] : [{ insertId: 1 }]) };
  await Client.create({ agency_id: agencyId, organization_id: 451, initials: 'SYN', is_demo: requested }, { executor, hydrate: false });
  const [sql, values] = executor.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT'));
  const fields = sql.match(/\(([^)]+)\)/)[1].split(',').map(field => field.trim());
  return Object.fromEntries(fields.map((field, i) => [field, values[i]]));
}
it('marks every newly created client in the verified synthetic tenant as demo', async () => {
  expect((await create(450, qa, false)).is_demo).toBe(1);
});
it.each([453,454])('marks NLU QA enrollment clients synthetic in verified scope %s',async agencyId=>{
  const agency={id:agencyId,slug:agencyId===453?'nlu-qa-demo':'nlu-qa-learning',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}};
  expect((await create(agencyId,agency,false)).is_demo).toBe(1);
  expect(await create(agencyId,{...agency,feature_flags:{}})).not.toHaveProperty('is_demo');
});
it('keeps the live NLU creation path unchanged',async()=>{expect(await create(6,{id:6,slug:'nlu',feature_flags:{}})).not.toHaveProperty('is_demo');});
it('does not infer a demo client from an agency number without its synthetic identity', async () => {
  expect(await create(450, { ...qa, feature_flags: {} })).not.toHaveProperty('is_demo');
  expect(await create(2, qa)).not.toHaveProperty('is_demo');
});
it('persists an explicit demo choice in ordinary client creation', async () => {
  expect((await create(2, null, true)).is_demo).toBe(1);
});
