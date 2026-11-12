import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {requireNoteworthyTrialSchema} from '../noteworthyReleaseReadiness.service.js';
import {noteworthyTrialDb} from './fixtures/noteworthyTrialDb.js';
it('blocks readiness when the durable deletion schema is absent',async()=>{
  const fixture=noteworthyTrialDb();
  try{await expect(requireNoteworthyTrialSchema(fixture.db)).rejects.toThrow();}
  finally{fixture.close();}
});
