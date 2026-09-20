import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import Index from '../../models/ProviderSearchIndex.model.js';
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockResolvedValue([[]]);});
describe('clinical index normalization',()=>{
 it('reindexes all affected clinical categories from a partial legacy field save without rewriting service settings',async()=>{
  pool.execute.mockImplementation(async sql=>[sql.includes('SELECT v.user_id')?[{user_id:8,field_key:'pt_specialties_max25',value_text:'Anxiety, Child'},{user_id:8,field_key:'modality',value_text:'Individuals'}]:[]]);
  await Index.upsertForUserInAgency({userId:8,agencyId:2,fieldKeys:['pt_specialties_max25']});
  const deletes=pool.execute.mock.calls.find(([sql])=>sql.startsWith('DELETE'));expect(deletes[1]).toContain('groups');expect(deletes[1]).not.toContain('work_location');
  const inserts=pool.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT')).map(([,args])=>args);
  expect(inserts).toContainEqual([2,8,'specialties_general','Anxiety']);expect(inserts).toContainEqual([2,8,'age_specialty','Children (6-10)']);expect(inserts).toContainEqual([2,8,'groups','Individuals']);
 });
 it('finds canonical values when a legacy specialty field or label is selected',async()=>{
  await Index.search({agencyId:2,filters:[{fieldKey:'pt_specialties_max25',op:'hasOption',value:'Behavioral Issues'}]});
  expect(pool.execute.mock.calls[0][1]).toEqual([2,'specialties_general','Behavioral Concerns',2]);
 });
 it('keeps general text searches working for normalized checkbox answers',async()=>{
  await Index.search({agencyId:2,filters:[],textQuery:'Anxiety'});expect(pool.execute.mock.calls[0][0]).toContain('value_option LIKE ?');expect(pool.execute.mock.calls[0][1]).toEqual([2,2,'%Anxiety%','%Anxiety%']);
 });
});
