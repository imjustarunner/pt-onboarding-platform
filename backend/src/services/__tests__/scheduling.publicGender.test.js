import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import Profile from '../../models/ProviderPublicProfile.model.js';
describe('public provider gender',()=>{
 it('uses the existing field intended for profile display',async()=>{
  pool.execute.mockImplementation(async sql=>sql.includes('FROM provider_public_profiles')?[[{public_details_json:{}}]]:[[{public_gender:'"Non-binary"'}]]);
  expect((await Profile.getForProvider({providerUserId:9})).details.gender).toBe('Non-binary');
  expect(pool.execute.mock.calls.at(-1)[0]).toContain("d.field_key='provider_marketing_gender'");
 });
 it('lets a provider clear public gender instead of republishing a legacy value',async()=>{
  pool.execute.mockImplementation(async sql=>sql.includes('FROM provider_public_profiles')?[[{public_details_json:{gender:''}}]]:[[{public_gender:'Woman'}]]);
  expect((await Profile.getForProvider({providerUserId:9})).details.gender).toBe('');
 });
});
