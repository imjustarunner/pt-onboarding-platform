import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
vi.mock('../../models/LearningClassSession.model.js',()=>({default:{findById:vi.fn(),update:vi.fn()}}));
vi.mock('../storage.service.js',()=>({default:{}}));
import LearningClassSession from '../../models/LearningClassSession.model.js';
import {getInPersonPlanPayload} from '../inPersonTutoring.service.js';
it('rejects a virtual session through the in-person URL without changing its delivery context',async()=>{
 LearningClassSession.findById.mockResolvedValue({id:20,delivery_context:'virtual'});
 await expect(getInPersonPlanPayload({sessionId:20})).rejects.toMatchObject({status:409});
 expect(LearningClassSession.update).not.toHaveBeenCalled();
});
