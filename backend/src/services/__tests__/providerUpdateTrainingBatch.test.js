import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),send:vi.fn(),sender:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>m}}));
vi.mock('../providerUpdate.service.js',()=>({recipientSeesSection:(key,a)=>!a.hidden?.includes(key)}));
vi.mock('../providerUpdateRecipient.service.js',()=>({resolveProviderUpdateRecipients:async(_a,rows)=>rows}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../providerUpdateEmailSender.service.js',()=>({resolveProviderUpdateSender:m.sender}));
import {queueTrainingBatch,dispatchTrainingBatch,trainingBatchSnapshot,trainingBatchEmail} from '../providerUpdateTrainingBatch.service.js';
const guide={id:'video',title:'Setup video',html:'<p>Instructions</p>'};
let config,notices,recipients,status;
beforeEach(()=>{vi.clearAllMocks();config={pin:true,license:true,_training:{pin:[guide],license:[{...guide,id:'photo',title:'License photo'}]}};notices=[];status='sent';recipients=[{id:10,provider_user_id:22,status:'finalized',assigned_keys:['pin','license']}];m.sender.mockResolvedValue({identity:{id:4},replyTo:'po@itsco.health'});m.send.mockResolvedValue({communicationId:7});
 m.execute.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM provider_update_pushes'))return [[{id:2,agency_id:2,title:'October',status,section_config_json:config,section_audience_json:{}}]];
  if(sql.startsWith('SELECT r.*'))return [recipients];
  if(sql.includes("SET status='cancelled'")){for(const n of notices)if((args.length===1?n.id===args[0]:n.revision_hash!==args[2])&&['queued','failed'].includes(n.status))n.status='cancelled';return [{affectedRows:1}];}
  if(sql.startsWith('INSERT IGNORE')){if(notices.some(n=>n.revision_hash===args[4]))return [{affectedRows:0}];notices.push({id:notices.length+1,provider_user_id:22,work_email:'staff@itsco.health',first_name:'Staff',assigned_keys:['pin','license'],revision_hash:args[4],guide_titles_json:args[5],status:'queued'});return [{affectedRows:1}];}
  if(sql.includes("SET status='queued'")){const n=notices.find(n=>n.revision_hash===args[2]&&['failed','cancelled'].includes(n.status));if(n)n.status='queued';return [{affectedRows:n?1:0}];}
  if(sql.startsWith('SELECT n.*'))return [notices.filter(n=>n.status==='queued').map(n=>({...n,section_config_json:config,section_audience_json:{}}))];
  if(sql.includes("SET status='sending'")){const n=notices.find(n=>n.id===args[0]&&n.status==='queued');if(n)n.status='sending';return [{affectedRows:n?1:0}];}
  if(sql.startsWith('UPDATE provider_update_training_notices SET status=?')){notices.find(n=>n.id===args[3]).status=args[0];return [{affectedRows:1}];}
  throw Error(sql);
 });
});
const args={pushId:2,agencyId:2};
it('queues one email with all guide links for completed staff without changing their progress',async()=>{expect(await queueTrainingBatch(args)).toEqual({queued:1,unchanged:0});expect(m.send).not.toHaveBeenCalled();await dispatchTrainingBatch(args);expect(m.send).toHaveBeenCalledTimes(1);expect(m.send.mock.calls[0][0]).toMatchObject({to:'staff@itsco.health',replyToOverride:'po@itsco.health',senderIdentityId:4});const text=m.send.mock.calls[0][0].text;expect(text).toContain('/license?guide=photo');expect(text).toContain('/pin?guide=video');const sql=m.execute.mock.calls.find(([s])=>s.startsWith('SELECT r.*'))[0];expect(sql).toContain('ACTIVE_EMPLOYEE');expect(sql).toContain("r.status='finalized'");expect(sql).toContain("LEFT(r.token,8)<>'preview_'");expect(m.execute.mock.calls.some(([s])=>s.includes('UPDATE provider_update_recipients'))).toBe(false);});
it('deduplicates repeated pushes, including pending sends',async()=>{m.send.mockResolvedValue({queued:true,communicationId:9});await queueTrainingBatch(args);await dispatchTrainingBatch(args);expect(await queueTrainingBatch(args)).toEqual({queued:0,unchanged:1});await dispatchTrainingBatch(args);expect(m.send).toHaveBeenCalledTimes(1);expect(notices[0].status).toBe('pending');});
it('supersedes unsent batches when more guides are explicitly pushed',async()=>{await queueTrainingBatch(args);config._training.pin.push({...guide,id:'second'});await queueTrainingBatch(args);await dispatchTrainingBatch(args);expect(notices.map(n=>n.status)).toEqual(['cancelled','sent']);expect(m.send).toHaveBeenCalledTimes(1);});
it('does not email later uploaded edits without a new explicit push',async()=>{await queueTrainingBatch(args);config._training.pin[0]={...guide,html:'<p>New</p>'};await dispatchTrainingBatch(args);expect(m.send.mock.calls[0][0].text).not.toContain('?guide=video');expect(m.send.mock.calls[0][0].text).toContain('?guide=photo');});
it('limits snapshots to enabled assigned permitted sections',()=>{config.license=false;expect(trainingBatchSnapshot(config,{},22,['pin','license'])).toHaveLength(1);expect(trainingBatchSnapshot(config,{hidden:['pin']},22,['pin'])).toEqual([]);});
it('handles no assigned sections and rejects draft campaigns',async()=>{recipients[0].assigned_keys=null;expect((await queueTrainingBatch(args)).queued).toBe(0);status='draft';await expect(queueTrainingBatch(args)).rejects.toThrow('invitations');expect(m.rollback).toHaveBeenCalled();});
it('escapes email content and uses persistent app links',()=>{const mail=trainingBatchEmail({firstName:'<x>',pushId:2,origin:'https://example.test',sections:[{sectionKey:'pin',guides:[{id:'g',title:'<script>'}]}]});expect(mail.html).toContain('&lt;script&gt;');expect(mail.html).not.toContain('<script>');expect(mail.text).toContain('/provider-update-instructions/2/pin?guide=g');});

import {validateOutboundEmailQuality} from '../outboundEmailQuality.service.js';
it('passes automated email quality checks without promising a file attachment',()=>{const email=trainingBatchEmail({firstName:'Staff',pushId:2,origin:'https://app.itsco.health',sections:[{sectionKey:'pin',guides:[guide]}]});expect(validateOutboundEmailQuality({...email,source:'auto',templateType:'provider_update_training'})).toEqual({ok:true,flags:[]});});
