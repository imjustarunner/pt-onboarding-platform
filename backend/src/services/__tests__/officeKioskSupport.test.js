import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),encrypt:vi.fn(),people:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>m,execute:m.execute}}));
vi.mock('../chatEncryption.service.js',()=>({encryptChatText:m.encrypt,isChatEncryptionConfigured:()=>true,decryptChatText:()=> 'private message'}));
vi.mock('../officeLobby.service.js',()=>({lobbyLocation:async()=>({id:1,name:'Windchime'}),officePeople:m.people}));
import {submitOfficeSupport,readOfficeSupport} from '../officeKioskSupport.service.js';
const args={locationId:1,agencyId:2,providerId:7,requestKey:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',message:'Sensitive fixture only'};
beforeEach(()=>{vi.resetAllMocks();m.people.mockResolvedValue({people:[{id:7,agencyId:2}]});m.encrypt.mockReturnValue({ciphertextB64:'cipher',ivB64:'iv',authTagB64:'tag',keyId:'v1'});m.execute.mockImplementation(async sql=>{
 if(sql.includes('WHERE request_key'))return [[]];if(sql.includes('FROM email_sender_identities'))return [[{from_email:'support@example.test'}]];if(sql.includes('SELECT DISTINCT u.id'))return [[{id:9}]];return [{insertId:12}];
});});
it('stores only encrypted content, copies the provider, and creates metadata-only app alerts',async()=>{
 await submitOfficeSupport(args);const ticket=m.execute.mock.calls.find(([q])=>q.includes('INSERT INTO support_tickets'));expect(ticket[0]).toContain("NULL,'open'");expect(ticket[1]).toContain('cipher');expect(ticket[1]).toContain('kiosk@example.test');expect(JSON.stringify(m.execute.mock.calls)).not.toContain(args.message);const notices=m.execute.mock.calls.filter(([q])=>q.includes('INSERT INTO notifications'));expect(notices.map(c=>c[1][1])).toEqual([9,7]);expect(m.commit).toHaveBeenCalledOnce();
});
it('fails closed when encryption is unavailable',async()=>{m.encrypt.mockImplementation(()=>{throw Error('missing key');});await expect(submitOfficeSupport(args)).rejects.toHaveProperty('status',503);expect(m.execute).not.toHaveBeenCalled();});
it('rejects a provider outside the selected location company',async()=>{await expect(submitOfficeSupport({...args,agencyId:99})).rejects.toHaveProperty('status',400);expect(m.encrypt).not.toHaveBeenCalled();});
it('does not duplicate a successfully received request on retry',async()=>{m.execute.mockResolvedValue([[{id:12,office_location_id:1,agency_id:2,provider_id:7}]]);await submitOfficeSupport(args);expect(m.execute).toHaveBeenCalledOnce();});
it('rolls back if an app recipient cannot be saved',async()=>{const impl=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>{if(sql.includes('INSERT INTO notifications'))throw Error('offline');return impl(sql,args);});await expect(submitOfficeSupport(args)).rejects.toThrow('offline');expect(m.rollback).toHaveBeenCalledOnce();expect(m.commit).not.toHaveBeenCalled();});
it('does not expose a copied message to a different provider',async()=>{m.execute.mockResolvedValue([[]]);await expect(readOfficeSupport(12,{id:55,role:'provider'})).rejects.toHaveProperty('status',404);});
