import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),query:vi.fn()},onTableWrite:vi.fn()}));
import Agency from '../../models/Agency.model.js';
import User from '../../models/User.model.js';
import {updatePublicAgencySupportSettings} from '../publicAgencySupport.service.js';
beforeEach(()=>{
 vi.spyOn(Agency,'findByPortalUrl').mockResolvedValue({id:450,theme_settings:{}});
 vi.spyOn(Agency,'update').mockResolvedValue({id:450});
 vi.spyOn(User,'getAgencies').mockResolvedValue([{id:450}]);
});
it.each(['officeCommunications','intakeLegal'])('denies support editing %s through the settings API',async key=>{
 await expect(updatePublicAgencySupportSettings('auricwell-qa-demo',{[key]:{}},{id:1434,role:'support'})).rejects.toMatchObject({status:403});
 expect(Agency.update).not.toHaveBeenCalled();
});
it('denies a guardian even when they belong to the organization',async()=>{
 await expect(updatePublicAgencySupportSettings('auricwell-qa-demo',{officeCommunications:{}},{id:1459,role:'client_guardian'})).rejects.toMatchObject({status:403});
 expect(Agency.update).not.toHaveBeenCalled();
});
