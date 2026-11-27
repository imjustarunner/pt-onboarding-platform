import {beforeEach,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {plotlineHiringCampaignDigest as digest} from '../../utils/plotlineHiringCampaign.js';
import {assertCarrierSmsPolicy} from '../vonage10dlc.service.js';
import {HIRING_UPGRADE_USER as user,HIRING_UPGRADE_PROCEDURE as procedure,HIRING_UPGRADE_HASH as hash,hiringSenderRegistration,plotlineHiringUpgradeSql} from '../../utils/plotlineHiringSenderUpgrade.js';
import {upgradePlotlineHiringSender} from '../../scripts/upgradePlotlineHiringSender.mjs';
const campaign={brand_id:'BCGLCIL',campaign_id:'VCZOP4JO',status:'ACTIVE',traffic_enabled:true,reseller_id:'R000000',usecase:'ACCOUNT_NOTIFICATION',opt_out_assist:false,embedded_link:true,description:'Optional application, interview, reference progress and hiring portal notices.',sample_one:'Plotline People Operations · ITSCO: Your onboarding is ready.',message_flow_details:{brand_name:'Plotline People Operations',consent_mechanisms:[{method:'ONLINE_FORM',details:'Optional signed application preference, email only default.',attachment:'https://plotlinepo.com/hiring-sms-consent'}],frequency:'RECURRING',privacy_policy:'https://plotlinepo.com/privacy',terms_and_conditions:'https://plotlinepo.com/terms'}};
const number={number:'17197165766',status:'LINKED'};
const policy=(c=campaign)=>({campaign:c,number,registration:{...hiringSenderRegistration,hiringJourneyApprovalDigest:digest(c)},from:'+17197165766',purpose:'workforce',body:'Hiring update. https://plotlinepo.com/hiring-sms-consent'});
let db,connect,readCarrier,env;
beforeEach(()=>{
 env={DB_USER:user,DB_PASSWORD:'synthetic-local-only',DB_NAME:'isolated_test',DB_HOST:'127.0.0.1'};
 db={end:vi.fn(),query:vi.fn(async sql=>sql.startsWith('SELECT USER')?[[{session_identity:user+'@localhost',database_identity:user+'@%'}]]:sql.startsWith('SHOW GRANTS')?[[{grant:'GRANT USAGE ON *.* TO scoped'},{grant:`GRANT EXECUTE ON PROCEDURE \`isolated_test\`.\`${procedure}\` TO scoped`}]]:[[[{upgrade_status:'applied'}]]])};
 connect=vi.fn(async()=>db);readCarrier=vi.fn(async path=>path.includes('/numbers/')?number:campaign);
});
it('fingerprints reviewed traffic and online opt-in contents while excluding volatile carrier status timestamps',()=>{
 expect(digest({...campaign,status:'UPDATES_REQUIRED',updated_at:'later'})).toBe(digest(campaign));
 for(const patch of [{description:'Changed purpose'},{sample_one:'Changed notice'},{message_flow_details:{...campaign.message_flow_details,consent_mechanisms:[]}}])expect(digest({...campaign,...patch})).not.toBe(digest(campaign));
 expect(digest({...campaign,message_flow_details:{...campaign.message_flow_details,frequency:'RECURRING'}})).toBe(digest(campaign));
});
it('requires an active linked campaign, online application evidence and its reviewed digest on every send',()=>{
 expect(()=>assertCarrierSmsPolicy(policy())).not.toThrow();
 expect(()=>assertCarrierSmsPolicy({...policy(),registration:{...policy().registration,hiringJourneyApprovalDigest:'0'.repeat(64)}})).toThrow();
 expect(()=>assertCarrierSmsPolicy(policy({...campaign,message_flow_details:{consent_mechanisms:[{method:'LIVE_OPERATOR',attachment:'https://plotlinepo.com/sms-consent'}]}}))).toThrow();
 expect(()=>assertCarrierSmsPolicy(policy({...campaign,status:'SUSPENDED'}))).toThrow();
 expect(()=>assertCarrierSmsPolicy({...policy(),controlReply:true,registration:{...policy().registration,hiringJourneyApprovalDigest:'old'}})).not.toThrow();
});
it('defaults to a read-only preview and requires execute-only automation attribution',async()=>{
 await upgradePlotlineHiringSender({approvalDigest:digest(campaign),env,connect,readCarrier});
 expect(readCarrier).not.toHaveBeenCalled();expect(db.query).toHaveBeenCalledWith(`CALL ${procedure}(?,?,?)`,[hash,digest(campaign),false]);expect(db.end).toHaveBeenCalledOnce();
 await expect(upgradePlotlineHiringSender({approvalDigest:digest(campaign),env:{...env,DB_USER:'human-admin'},connect,readCarrier})).rejects.toHaveProperty('code','PLOTLINE_HIRING_SCOPED_IDENTITY_REQUIRED');
});
it('rechecks exact live campaign and number before scoped apply, never edits the carrier registration',async()=>{
 await upgradePlotlineHiringSender({apply:true,approvalDigest:digest(campaign),env,connect,readCarrier});
 expect(readCarrier.mock.calls.map(([path])=>path)).toEqual(['/brands/BCGLCIL/campaigns/VCZOP4JO','/brands/BCGLCIL/campaigns/VCZOP4JO/numbers/17197165766']);
 expect(db.query).toHaveBeenCalledWith(`CALL ${procedure}(?,?,?)`,[hash,digest(campaign),true]);
 db.query.mockClear();await expect(upgradePlotlineHiringSender({apply:true,approvalDigest:'a'.repeat(64),env,connect,readCarrier})).rejects.toHaveProperty('code','PLOTLINE_HIRING_APPROVAL_CHANGED');
 expect(db.query.mock.calls.some(([sql])=>sql.startsWith('CALL'))).toBe(false);
});
it('keeps the manual SQL artifact exact and scopes mutation to the fixed sender plus append-only automation audit',()=>{
 const sql=plotlineHiringUpgradeSql();
 expect(readFileSync(new URL('../../scripts/sql/plotline-hiring-sender-20261126.sql',import.meta.url),'utf8')).toBe('DELIMITER $$\n'+sql+'$$\nDELIMITER ;\n');
 expect(sql).toContain('updated_by_user_id=NULL');expect(sql).toContain("'actor_type','automation'");
 expect(sql).not.toMatch(/UPDATE users|UPDATE sms_consent_requests|DELETE FROM|UPDATE user_activity_log/);
});
