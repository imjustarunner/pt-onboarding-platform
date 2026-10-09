import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),send:vi.fn(),sender:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>m}}));
vi.mock('../providerUpdate.service.js',()=>({recipientSeesSection:(_key,audience,id)=>!audience.only||audience.only.includes(id)}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../providerUpdateEmailSender.service.js',()=>({resolveProviderUpdateSender:m.sender}));
vi.mock('../storage.service.js',()=>({default:{getSignedUrl:vi.fn()}}));
import {trainingRevision,changedTrainingGuides,trainingNoticeEmail,saveTrainingAndNotify,dispatchTrainingNotices} from '../providerUpdateTrainingNotice.service.js';
const guide={id:'video',title:'Set your availability',html:'<a href="https://youtu.be/abc12345678">Watch</a>'};
let config,notices;
beforeEach(()=>{vi.clearAllMocks();config={pin:true,license:true,_training:{license:[guide]}};notices=[];m.sender.mockResolvedValue({identity:{id:4},replyTo:'po@itsco.health'});m.send.mockResolvedValue({id:'email-1',communicationId:7});
 m.execute.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM provider_update_pushes'))return [[{id:2,agency_id:2,title:'October',status:'sent',section_config_json:config,section_audience_json:{}}]];
  if(sql.startsWith('UPDATE provider_update_pushes')){config=JSON.parse(args[0]);return [{affectedRows:1}];}
  if(sql.startsWith('SELECT r.*'))return [[{id:10,provider_user_id:22,status:'finalized',locked_at:'2026-10-09'}]];
  if(sql.startsWith('INSERT IGNORE')){if(!notices.some(n=>n.revision_hash===args[4]))notices.push({id:1,push_id:2,recipient_id:10,provider_user_id:22,work_email:'staff@example.test',first_name:'Example',revision_hash:args[4],guide_titles_json:args[5],status:'queued'});return [{affectedRows:1}];}
  if(sql.startsWith("UPDATE provider_update_training_notices SET status='queued'")){notices.filter(n=>n.status==='failed').forEach(n=>n.status='queued');return [{affectedRows:1}];}
  if(sql.startsWith('SELECT COALESCE(SUM'))return [[{sent:notices.filter(n=>n.status==='sent').length,pending:notices.filter(n=>['queued','sending','pending'].includes(n.status)).length,failed:notices.filter(n=>n.status==='failed').length}]];
  if(sql.startsWith('SELECT n.*'))return [notices.filter(n=>['queued','failed'].includes(n.status)).map(n=>({...n,section_config_json:config,section_audience_json:{}}))];
  if(sql.includes("SET status='sending'")){const n=notices.find(n=>n.id===args[0]);if(!['queued','failed'].includes(n.status))return [{affectedRows:0}];n.status='sending';return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE provider_update_training_notices SET status=?')){notices.find(n=>n.id===args[3]).status=args[0];return [{affectedRows:1}];}
  throw Error(sql);
 });
});
async function publish(args){const saved=await saveTrainingAndNotify(args);return {...saved,delivery:await dispatchTrainingNotices(args)};}
it('emails completed recipients with section context and durable instructions, preserving completion',async()=>{const result=await publish({pushId:2,agencyId:2,sectionKey:'pin',guides:[guide]});expect(result.delivery.sent).toBe(1);expect(m.send.mock.calls[0][0].text).toContain('/provider-update-instructions/2/pin');expect(m.send.mock.calls[0][0].text).toContain('completed');expect(config._training.license).toEqual([guide]);expect(m.execute.mock.calls.some(([sql])=>sql.includes('UPDATE provider_update_recipients'))).toBe(false);const selection=m.execute.mock.calls.find(([sql])=>sql.startsWith('SELECT r.*'))[0];expect(selection).toContain("LEFT(r.token,8)<>'preview_'");expect(selection).not.toContain('locked_at IS NULL');expect(selection).toContain('provider_update_section_progress');});
it('does not re-email unchanged guides and only notifies on additions or edits',async()=>{const args={pushId:2,agencyId:2,sectionKey:'pin',guides:[guide]};await publish(args);await publish(args);expect(m.send).toHaveBeenCalledTimes(1);expect(changedTrainingGuides([guide],[])).toEqual([]);expect(changedTrainingGuides([guide],[{...guide,title:'Updated'}])).toHaveLength(1);});
it('keeps notification-free edits silent',async()=>{await saveTrainingAndNotify({pushId:2,agencyId:2,sectionKey:'pin',guides:[guide],notify:false});expect(m.send).not.toHaveBeenCalled();expect(notices).toHaveLength(0);});
it('tracks failed delivery and retries without resending successful notices',async()=>{m.send.mockRejectedValueOnce(Error('Service unavailable'));const args={pushId:2,agencyId:2,sectionKey:'pin',guides:[guide]};expect((await publish(args)).delivery.failed).toBe(1);expect((await publish(args)).delivery.sent).toBe(1);await dispatchTrainingNotices(args);expect(m.send).toHaveBeenCalledTimes(2);});
it('does not call a queued email delivered and never queues it twice',async()=>{m.send.mockResolvedValue({queued:true,communicationId:9});const args={pushId:2,agencyId:2,sectionKey:'pin',guides:[guide]};expect((await publish(args)).delivery.pending).toBe(1);await publish(args);expect(m.send).toHaveBeenCalledTimes(1);});
it('escapes email content and includes the section description',()=>{const email=trainingNoticeEmail({firstName:'<script>',section:{title:'Calendar',description:'Set availability.'},guideTitles:['<b>unsafe</b>'],link:'https://example.test'});expect(email.html).toContain('&lt;script&gt;');expect(email.html).not.toContain('<b>unsafe');expect(email.text).toContain('Set availability.');});
it('rejects unknown sections and cross-agency media before any write or email',async()=>{await expect(saveTrainingAndNotify({pushId:2,agencyId:2,sectionKey:'bad',guides:[]})).rejects.toThrow('Unknown');await expect(saveTrainingAndNotify({pushId:2,agencyId:2,sectionKey:'pin',guides:[{...guide,html:'<img data-training-key="uploads/training_media/agency_9/image/a.png">'}]})).rejects.toThrow('belong');expect(m.execute).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();});

it('saves and queues notifications without waiting for outbound email',async()=>{const result=await saveTrainingAndNotify({pushId:2,agencyId:2,sectionKey:'pin',guides:[guide]});expect(result.delivery.pending).toBe(1);expect(m.send).not.toHaveBeenCalled();expect(m.commit).toHaveBeenCalled();});

it('keeps revision hashes stable when MySQL JSON reorders object keys',()=>{expect(trainingRevision([guide])).toBe(trainingRevision([{html:guide.html,id:guide.id,title:guide.title}]))});
