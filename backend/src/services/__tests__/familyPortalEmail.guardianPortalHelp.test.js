import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import sharp from 'sharp';
import {submitGuardianPortalHelp} from '../guardianPortalHelp.service.js';
import {decryptChatText} from '../chatEncryption.service.js';
import {decryptGuardianScreenshot} from '../guardianPortalScreenshotEncryption.service.js';

const input={user:{id:10,role:'client_guardian'},agencyId:2,clientId:8,question:'Download shows an error after I tap the button.',requestId:'b4da23fd-d129-4cf4-947e-c1a1c8caf95d'};
let d,db,save,remove;
afterEach(()=>vi.unstubAllEnvs());
beforeEach(()=>{
 vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,4).toString('base64'));
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,params)=>{
   expect((sql.match(/\?/g)||[]).length).toBe(params.length);
   if(sql.includes('SELECT ticket_id'))return [[]];
   if(sql.includes('INSERT INTO support_tickets'))return [{insertId:71}];
   return [[]];
 })};
 save=vi.fn();remove=vi.fn();
 d={database:{getConnection:vi.fn(async()=>db)},links:vi.fn(async()=>[{client_id:8,agency_id:2,organization_id:9,permissions_json:{},access_enabled:1}]),assign:vi.fn(async()=>5),bucket:vi.fn(async()=>({file:()=>({save,delete:remove})})),notify:vi.fn(async()=>{})};
});
describe('guardian portal issue reports',()=>{
 it('encrypts support text, assigns the existing technology owner and emits only an in-app notice',async()=>{
   expect(await submitGuardianPortalHelp(input,d)).toEqual({ticketId:71});
   const [sql,p]=db.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO support_tickets'));
   expect(sql).toContain("'technology'");expect(sql).toContain("'AuricWell portal issue'");expect(p[4]).toBeNull();
   expect(decryptChatText({ciphertextB64:p[5],ivB64:p[6],authTagB64:p[7],keyId:p[8]})).toBe(input.question);
   expect(d.assign).toHaveBeenCalledWith({ticketId:71,agencyId:2},db);expect(db.commit).toHaveBeenCalledOnce();
   expect(d.notify).toHaveBeenCalledWith(expect.objectContaining({userId:5,relatedEntityId:71}));expect(JSON.stringify(d.notify.mock.calls)).not.toContain(input.question);
 });
 it.each([{preview:true},{user:{id:10,role:'admin'}},{agencyId:6},{clientId:9}])('rejects unauthorized context before storing a report: %j',async overrides=>{
   await expect(submitGuardianPortalHelp({...input,...overrides},d)).rejects.toMatchObject({status:403});expect(d.database.getConnection).not.toHaveBeenCalled();
 });
 it('honors a blocked guardian link',async()=>{d.links.mockResolvedValue([{client_id:8,agency_id:2,permissions_json:{noViewOtherGuardian:true},access_enabled:1}]);await expect(submitGuardianPortalHelp(input,d)).rejects.toMatchObject({status:403});expect(d.database.getConnection).not.toHaveBeenCalled();});
 it('fails closed when report encryption is unavailable',async()=>{await expect(submitGuardianPortalHelp(input,{...d,encrypt:()=>({encrypted:false})})).rejects.toMatchObject({status:503});expect(d.database.getConnection).not.toHaveBeenCalled();});
 it('returns the original ticket on a retry without uploads or a second notice',async()=>{
   db.execute.mockImplementation(async sql=>sql.includes('SELECT ticket_id')?[[{ticket_id:44,agency_id:2,client_id:8}]]:[[]]);
   expect(await submitGuardianPortalHelp(input,d)).toEqual({ticketId:44,alreadySubmitted:true});expect(d.assign).not.toHaveBeenCalled();expect(d.notify).not.toHaveBeenCalled();expect(d.bucket).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalledOnce();
 });
 it('does not reuse a prior ticket for another profile',async()=>{db.execute.mockImplementation(async sql=>sql.includes('SELECT ticket_id')?[[{ticket_id:44,agency_id:2,client_id:9}]]:[[]]);await expect(submitGuardianPortalHelp(input,d)).rejects.toMatchObject({status:409});expect(d.assign).not.toHaveBeenCalled();});
 it('re-encodes screenshots and stores bounded private attachment paths without client filenames',async()=>{
   const image=await sharp({create:{width:2,height:2,channels:3,background:'#ff0000'}}).jpeg().toBuffer();
   await submitGuardianPortalHelp({...input,files:[{mimetype:'image/jpeg',buffer:image,originalname:'client-full-name.jpg'}]},d);
   const [stored,options]=save.mock.calls[0];expect(options.metadata.contentType).toBe('application/octet-stream');const buffer=decryptGuardianScreenshot(stored,{ticketId:71});expect((await sharp(buffer).metadata()).format).toBe('png');expect(options.metadata.cacheControl).toBe('private,no-store');
   expect(()=>decryptGuardianScreenshot(stored,{ticketId:72})).toThrow('does not belong');
   const [,values]=db.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO support_ticket_attachments'));expect(values[2]).toBe('Screenshot 1.png');expect(values[3]).toMatch(/^support-tickets\/2\/71\/[a-f0-9-]+\.guardian\.enc$/);expect(JSON.stringify(values)).not.toContain('client-full-name');
 });
 it('rejects a fake image and rolls back rather than trusting its MIME label',async()=>{
   await expect(submitGuardianPortalHelp({...input,files:[{mimetype:'image/png',buffer:Buffer.from('<script>bad</script>')}]},d)).rejects.toMatchObject({status:400});expect(save).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();
 });
 it('rolls back if no unique technology owner is configured',async()=>{d.assign.mockRejectedValue(new Error('No unique owner'));await expect(submitGuardianPortalHelp(input,d)).rejects.toThrow('No unique owner');expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();expect(d.notify).not.toHaveBeenCalled();});
 it('removes an uploaded object if the attachment record cannot be stored',async()=>{
   const image=await sharp({create:{width:1,height:1,channels:3,background:'#fff'}}).png().toBuffer();
   const execute=db.execute.getMockImplementation();db.execute.mockImplementation(async(sql,p)=>{if(sql.includes('INSERT INTO support_ticket_attachments'))throw new Error('storage failure');return execute(sql,p);});
   await expect(submitGuardianPortalHelp({...input,files:[{mimetype:'image/png',buffer:image}]},d)).rejects.toThrow('storage failure');expect(remove).toHaveBeenCalledOnce();expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();
 });
});
