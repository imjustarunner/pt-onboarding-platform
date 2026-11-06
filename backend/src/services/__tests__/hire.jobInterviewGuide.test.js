import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),defaultSet:vi.fn(),template:vi.fn(),update:vi.fn(),create:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/InterviewHubJobQuestionSet.model.js',()=>({default:{findDefaultForJob:m.defaultSet,updateById:m.update,create:m.create}}));
vi.mock('../../models/InterviewHubTemplate.model.js',()=>({default:{findDefaultByAgencyId:m.template}}));
import {buildInterviewFlow,DEFAULT_SCORECARD_CRITERIA} from '../interviewHub.service.js';
import {jobInterviewSettings} from '../../utils/jobInterviewSettingsPolicy.js';
import {getJobInterviewGuide,saveJobInterviewGuide} from '../../controllers/interviewHub.controller.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[{id:45,title:'Counselor'}]]);m.template.mockResolvedValue(null);m.defaultSet.mockResolvedValue(null);});
it('uses job ratings first, then agency ratings, then platform defaults',()=>{
 const agency=[{key:'team',label:'Teamwork',weight:1}],job=[{key:'clinical',label:'Clinical judgment',weight:1}];
 expect(buildInterviewFlow({template:{scorecard_criteria_json:agency},jobQuestionSet:{scorecard_criteria_json:job}}).scorecardCriteria).toEqual(job);
 expect(buildInterviewFlow({template:{scorecard_criteria_json:agency}}).scorecardCriteria).toEqual(agency);
 expect(buildInterviewFlow().scorecardCriteria).toEqual(DEFAULT_SCORECARD_CRITERIA);
});
it('retains the scheduled guide when a job’s future defaults change',()=>{
 const previousFlow=buildInterviewFlow({jobQuestionSet:{questions_json:['Original question']}});
 expect(buildInterviewFlow({previousFlow,jobQuestionSet:{questions_json:['Changed question']},regenerateIcebreaker:false,regenerateSalutation:false})).toBe(previousFlow);
});
it('validates usable question text and unique, positive rating criteria',()=>{
 expect(jobInterviewSettings({questions:['Describe your experience'],criteria:null}).criteria).toBeNull();
 for(const criteria of [[],[{key:'a',label:'A',weight:0}],[{key:'a',label:'A'},{key:'a',label:'B'}]])expect(()=>jobInterviewSettings({questions:[],criteria})).toThrow();
});
it('returns platform defaults for an agency job with no saved guide',async()=>{
 const res={json:vi.fn()},next=vi.fn();
 await getJobInterviewGuide({user:{id:1,role:'super_admin'},params:{jobDescriptionId:'45'},query:{agencyId:6}},res,next);
 expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({criteriaSource:'platform',criteria:DEFAULT_SCORECARD_CRITERIA})}));
});
it('saves only the selected agency job’s guide',async()=>{
 const res={json:vi.fn()},next=vi.fn();
 await saveJobInterviewGuide({user:{id:1,role:'super_admin'},params:{jobDescriptionId:'45'},body:{agencyId:6,questions:['Experience?'],criteria:[{key:'experience',label:'Experience',weight:1}]}},res,next);
 expect(next).not.toHaveBeenCalled();expect(m.create).toHaveBeenCalledWith(expect.objectContaining({agencyId:6,jobDescriptionId:45,scorecardCriteriaJson:[{key:'experience',label:'Experience',weight:1}]}));
});
it('rejects a job that belongs to another agency before reading or changing its guide',async()=>{
 m.execute.mockResolvedValue([[]]);const next=vi.fn();
 await saveJobInterviewGuide({user:{id:1,role:'super_admin'},params:{jobDescriptionId:'45'},body:{agencyId:2,questions:[],criteria:null}},{json:vi.fn()},next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404}));expect(m.create).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
});
