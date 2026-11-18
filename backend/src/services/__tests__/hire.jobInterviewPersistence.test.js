import {DatabaseSync} from 'node:sqlite';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>state.db.execute(...args),getConnection:()=>state.db.getConnection()},onTableWrite:vi.fn()}));
import {createJobWithInterviewQuestions,updateJobWithInterviewQuestions,replaceJobWithInterviewQuestions,parsePostingInterviewSettings} from '../jobInterviewQuestions.service.js';
import Sets from '../../models/InterviewHubJobQuestionSet.model.js';
let sql;
beforeEach(()=>{
 sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE hiring_job_descriptions(id INTEGER PRIMARY KEY AUTOINCREMENT,agency_id INTEGER,title TEXT,description_text TEXT,description_sections_json TEXT,posted_date TEXT,application_deadline TEXT,city TEXT,state TEXT,education_level TEXT,role_type TEXT,is_featured INTEGER,tags_json TEXT,application_page_json TEXT,storage_path TEXT,original_name TEXT,mime_type TEXT,is_active INTEGER,created_by_user_id INTEGER,publish_at TEXT,unpublish_at TEXT,schedule_text TEXT,credential_mode TEXT,interview_question_set_id INTEGER,prehire_config_json TEXT);
 CREATE TABLE interview_hub_templates(id INTEGER PRIMARY KEY,agency_id INTEGER,is_default INTEGER,standard_questions_json TEXT);
 CREATE TABLE interview_hub_job_question_sets(id INTEGER PRIMARY KEY AUTOINCREMENT,agency_id INTEGER,job_description_id INTEGER,title TEXT,questions_json TEXT,scorecard_criteria_json TEXT,is_active INTEGER,created_by_user_id INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
 const execute=async(statement,args=[])=>{const prepared=sql.prepare(statement.replace(/ FOR UPDATE/g,'').replace(/ LIMIT 1(?=\s*$)/i,''));return /^\s*SELECT/i.test(statement)?[prepared.all(...args)]:[{insertId:Number(prepared.run(...args).lastInsertRowid)}];};
 const conn={execute,beginTransaction:async()=>sql.exec('BEGIN'),commit:async()=>sql.exec('COMMIT'),rollback:async()=>sql.exec('ROLLBACK'),release:()=>{}};
 state.db={execute,getConnection:async()=>conn};
});
afterEach(()=>sql.close());
const create=title=>createJobWithInterviewQuestions({agencyId:6,title,createdByUserId:1434},{db:state.db});
it('creates an independently owned starter set for every new job in the same transaction',async()=>{
 const a=await create('Operations'),b=await create('Consultant');
 const first=await Sets.findDefaultForJob(6,a.id),second=await Sets.findDefaultForJob(6,b.id);
 expect(first.id).not.toBe(second.id);expect(first.questions_json).toHaveLength(5);expect(first.created_by_user_id).toBe(1434);expect(first.job_description_id).toBe(a.id);
 await Sets.saveDefaultForJob({agencyId:6,jobDescriptionId:a.id,title:'Operations',questionsJson:[{key:'q1',text:'Updated operations question'}]});
 expect((await Sets.findDefaultForJob(6,b.id)).questions_json).toHaveLength(5);
});
it('copies the company template into the new job without a live link to future template edits',async()=>{
 sql.prepare('INSERT INTO interview_hub_templates VALUES(1,6,1,?)').run(JSON.stringify([{key:'company',text:'Company question'}]));
 const job=await create('Operations');sql.prepare('UPDATE interview_hub_templates SET standard_questions_json=?').run('[]');
 expect((await Sets.findDefaultForJob(6,job.id)).questions_json).toEqual([{key:'company',text:'Company question'}]);
});
it('keeps the pinned job default when another set is created or edited for the same job',async()=>{
 const job=await create('Operations'),original=await Sets.findDefaultForJob(6,job.id);
 const alternative=await Sets.create({agencyId:6,jobDescriptionId:job.id,title:'Second round',questionsJson:['A different question'],createdByUserId:1434});
 await Sets.updateById(alternative.id,{questionsJson:['A changed question']});
 expect((await Sets.findDefaultForJob(6,job.id)).id).toBe(original.id);
});
it('does not silently promote an alternative into the default for a legacy job with no saved guide',async()=>{
 const job=sql.prepare("INSERT INTO hiring_job_descriptions(agency_id,title) VALUES(6,'Legacy without guide')").run();
 await Sets.create({agencyId:6,jobDescriptionId:Number(job.lastInsertRowid),title:'Alternative',questionsJson:['Alternative question']});
 expect(await Sets.findDefaultForJob(6,Number(job.lastInsertRowid))).toBeNull();
});
it('rolls back the job if its required question set cannot be created',async()=>{
 sql.exec("CREATE TRIGGER reject_set BEFORE INSERT ON interview_hub_job_question_sets BEGIN SELECT RAISE(ABORT,'simulated failure'); END;");
 await expect(create('Operations')).rejects.toThrow('simulated failure');expect(sql.prepare('SELECT COUNT(*) n FROM hiring_job_descriptions').get().n).toBe(0);
});
it('refuses to attach a guide to another company’s job',async()=>{
 const job=await create('Operations');await expect(Sets.saveDefaultForJob({agencyId:99,jobDescriptionId:job.id,title:'Foreign',questionsJson:[]})).rejects.toMatchObject({status:404});
 expect((await Sets.findDefaultForJob(6,job.id)).questions_json).toHaveLength(5);
});
it('saves posting metadata and edited questions together, without changing another job',async()=>{
 const job=await create('Operations'),other=await create('Other job');
 await updateJobWithInterviewQuestions({agencyId:6,jobId:job.id,patch:{title:'Updated role'},settings:{questions:[{key:'q1',text:'Updated question'}],criteria:null},actorUserId:1434},{db:state.db});
 expect(sql.prepare('SELECT title FROM hiring_job_descriptions WHERE id=?').get(job.id).title).toBe('Updated role');
 expect((await Sets.findDefaultForJob(6,job.id)).questions_json).toEqual([{key:'q1',text:'Updated question'}]);
 expect((await Sets.findDefaultForJob(6,other.id)).questions_json).toHaveLength(5);
});
it('keeps the previous guide intact when only posting metadata is saved',async()=>{
 const job=await create('Operations'),previous=await Sets.findDefaultForJob(6,job.id);
 await updateJobWithInterviewQuestions({agencyId:6,jobId:job.id,patch:{city:'Denver'},settings:undefined,actorUserId:1434},{db:state.db});
 expect((await Sets.findDefaultForJob(6,job.id)).questions_json).toEqual(previous.questions_json);
});
it('rolls metadata back if saving the questions fails',async()=>{
 const job=await create('Operations'),previous=await Sets.findDefaultForJob(6,job.id);
 sql.exec("CREATE TRIGGER reject_guide_update BEFORE UPDATE ON interview_hub_job_question_sets BEGIN SELECT RAISE(ABORT,'synthetic question save failure'); END;");
 await expect(updateJobWithInterviewQuestions({agencyId:6,jobId:job.id,patch:{title:'Must roll back'},settings:{questions:[{key:'q1',text:'Must not overwrite'}],criteria:null},actorUserId:1434},{db:state.db})).rejects.toThrow('synthetic question save failure');
 expect(sql.prepare('SELECT title FROM hiring_job_descriptions WHERE id=?').get(job.id).title).toBe('Operations');
 expect((await Sets.findDefaultForJob(6,job.id)).questions_json).toEqual(previous.questions_json);
});
it('copies questions and ratings into a new PDF version while retaining the old guide',async()=>{
 const job=await create('Operations');
 const questions=[{key:'q1',text:'Role-specific saved question'}],criteria=[{key:'communication',label:'Communication',weight:1}];
 await Sets.saveDefaultForJob({agencyId:6,jobDescriptionId:job.id,title:'Original',questionsJson:questions,scorecardCriteriaJson:criteria});
 const old=await Sets.findDefaultForJob(6,job.id);
 const replacement=await replaceJobWithInterviewQuestions({previousJobId:job.id,input:{agencyId:6,title:'Operations v2',createdByUserId:1434},prehireConfigJson:{documents:[]}},{db:state.db});
 const guide=await Sets.findDefaultForJob(6,replacement.id);
 expect(guide.id).not.toBe(old.id);expect(guide.questions_json).toEqual(questions);expect(guide.scorecard_criteria_json).toEqual(criteria);
 expect(sql.prepare('SELECT is_active FROM hiring_job_descriptions WHERE id=?').get(job.id).is_active).toBe(0);
 expect((await Sets.findDefaultForJob(6,job.id)).questions_json).toEqual(questions);
});
it('uses edited questions on the replacement without changing the previous version',async()=>{
 const job=await create('Operations'),previous=await Sets.findDefaultForJob(6,job.id);
 const settings={questions:[{key:'new',text:'New version question'}],criteria:null};
 const replacement=await replaceJobWithInterviewQuestions({previousJobId:job.id,input:{agencyId:6,title:'Operations v2',createdByUserId:1434},settings},{db:state.db});
 expect((await Sets.findDefaultForJob(6,replacement.id)).questions_json).toEqual(settings.questions);
 expect((await Sets.findDefaultForJob(6,job.id)).questions_json).toEqual(previous.questions_json);
});
it('rolls back a failed replacement and leaves the original posting active',async()=>{
 const job=await create('Operations');
 sql.exec("CREATE TRIGGER reject_replacement BEFORE INSERT ON interview_hub_job_question_sets BEGIN SELECT RAISE(ABORT,'synthetic replacement failure'); END;");
 await expect(replaceJobWithInterviewQuestions({previousJobId:job.id,input:{agencyId:6,title:'Operations v2',createdByUserId:1434}},{db:state.db})).rejects.toThrow('synthetic replacement failure');
 expect(sql.prepare('SELECT COUNT(*) n FROM hiring_job_descriptions').get().n).toBe(1);
 expect(sql.prepare('SELECT is_active FROM hiring_job_descriptions WHERE id=?').get(job.id).is_active).toBe(1);
});
it('validates the multipart question settings before modifying a posting',()=>{
 expect(parsePostingInterviewSettings({})).toBeUndefined();
 expect(parsePostingInterviewSettings({interviewGuideJson:'{"questions":["Saved question"],"criteria":null}'}).questions).toEqual([{key:'job_q_1',text:'Saved question'}]);
 for(const value of ['not json','null','{"questions":[""]}'])expect(()=>parsePostingInterviewSettings({interviewGuideJson:value})).toThrow();
});
