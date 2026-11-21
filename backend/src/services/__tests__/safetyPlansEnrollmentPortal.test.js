import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../safetyPlans/access.js',()=>({clientAccess:vi.fn(),agencyBrand:vi.fn().mockResolvedValue({name:'Synthetic Agency'}),recipientOptions:vi.fn().mockResolvedValue([])}));
vi.mock('../enrollmentPacket.service.js',()=>({getEnrollmentPacketDocuments:vi.fn()}));
vi.mock('../storage.service.js',()=>({default:{readObject:vi.fn(),readTemplate:vi.fn()}}));
import {clientAccess} from '../safetyPlans/access.js';
import Storage from '../storage.service.js';
import {getEnrollmentPacketDocuments} from '../enrollmentPacket.service.js';
import {resolveEnrollmentFoundation,enrollmentPortalCatalog} from '../enrollmentPortal.service.js';
import {completedPortalScreen,portalScreenDefinition,requirePortalScreenRecipient} from '../familyPortalScreening.service.js';
const user={id:8,role:'provider'};
beforeEach(()=>{vi.clearAllMocks();clientAccess.mockResolvedValue({id:41,agency_id:2,organization_id:15,full_name:'Synthetic Client'});getEnrollmentPacketDocuments.mockResolvedValue([{key:'privacy',title:'Privacy',html:'<p>Official text</p>',version:2,hash:'immutable'}]);});
it('derives the school and tenant from the authorized client and never accepts caller HTML',async()=>{
 const doc=await resolveEnrollmentFoundation(user,{clientId:41,foundationKey:'privacy',channel:'school',audience:'guardian',html:'Forged'});
 expect(getEnrollmentPacketDocuments).toHaveBeenCalledWith({agencyId:2,organizationId:15,channel:'school',audience:'guardian',service:'counseling',locale:'en'});
 expect(doc).toMatchObject({key:'enrollment-document',sourceHtml:'<p>Official text</p>',source:{hash:'immutable'}});
});
it('rejects spoofed organization, unknown variant and missing document before creating a snapshot',async()=>{
 await expect(resolveEnrollmentFoundation(user,{clientId:41,foundationKey:'privacy',agencyId:99})).rejects.toMatchObject({status:403});
 await expect(resolveEnrollmentFoundation(user,{clientId:41,foundationKey:'privacy',organizationId:99,channel:'school'})).rejects.toMatchObject({status:403});
 await expect(resolveEnrollmentFoundation(user,{clientId:41,foundationKey:'privacy',service:'unlisted'})).rejects.toMatchObject({status:400});
 await expect(resolveEnrollmentFoundation(user,{clientId:41,foundationKey:'unknown'})).rejects.toMatchObject({status:404});
});
it('checks client authorization before disclosing catalog content',async()=>{
 clientAccess.mockRejectedValue(Object.assign(Error('Denied'),{status:403}));
 await expect(enrollmentPortalCatalog(user,41)).rejects.toMatchObject({status:403});expect(getEnrollmentPacketDocuments).not.toHaveBeenCalled();
});
it('retains original uploaded PDF bytes inside the protected snapshot',async()=>{
 getEnrollmentPacketDocuments.mockResolvedValue([{key:'privacy',title:'Privacy',attachmentPath:'/uploads/templates/1.pdf',html:'Placeholder'}]);Storage.readTemplate.mockResolvedValue(Buffer.from('%PDF-1.4\nsynthetic'));
 const document=await resolveEnrollmentFoundation(user,{clientId:41,foundationKey:'privacy'});
 expect(document.sourceHtml).toBe('');expect(Buffer.from(document.sourcePdf.base64,'base64').toString()).toBe('%PDF-1.4\nsynthetic');
});

it('resolves legacy bare template filenames from the same storage as printable packets',async()=>{
 getEnrollmentPacketDocuments.mockResolvedValue([{key:'privacy',title:'Privacy',attachmentPath:'legacy.pdf'}]);
 Storage.readTemplate.mockResolvedValue(Buffer.from('%PDF-1.4\nsynthetic'));
 const document=await resolveEnrollmentFoundation(user,{clientId:41,foundationKey:'privacy'});
 expect(Storage.readTemplate).toHaveBeenCalledWith('legacy.pdf');
 expect(document.sourcePdf).toBeTruthy();
});

it('keeps all acknowledged notices with a combined receipt and does not duplicate answer fields',async()=>{
 getEnrollmentPacketDocuments.mockResolvedValue([{key:'privacy',title:'Privacy',html:'<p>Full privacy notice</p>',sections:[{title:'About you',fields:[['name','Name',{}]]}]},{key:'consent',title:'Consent',html:'<p>Full service consent</p>',sections:[{title:'More',fields:[['name','Name',{}],['optional','Optional campaign',{type:'radio',options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}]}]]}]},{key:'packet-acknowledgment',title:'Receipt',html:'<p>I received the documents</p>'}]);
 const document=await resolveEnrollmentFoundation(user,{clientId:41,foundationKey:'packet-acknowledgment'});
 expect(document.sourceHtml).toContain('Full privacy notice');expect(document.sourceHtml).toContain('Full service consent');expect(document.source.documents).toHaveLength(3);expect(document.sections.flatMap(s=>s.fields).map(f=>f[0])).toEqual(['name','optional']);
});

it('offers a canonical, scored PSC-17 only for an eligible guardian respondent',async()=>{
 clientAccess.mockResolvedValue({id:41,agency_id:2,date_of_birth:`${new Date().getUTCFullYear()-10}-06-15`});
 const catalog=await enrollmentPortalCatalog(user,41);
 expect(catalog.documents).toContainEqual(expect.objectContaining({key:'portal-psc-17',instrumentId:'psc-17'}));
 const screen=await resolveEnrollmentFoundation(user,{clientId:41,foundationKey:'portal-psc-17',locale:'es'});
 expect(screen.sections[0].fields).toHaveLength(17);
 const answers=Object.fromEntries(screen.sections[0].fields.map(([key])=>[key,'2']));
 expect(completedPortalScreen(screen,answers)).toEqual({instrumentKey:'psc17',total:34});
 delete answers[screen.sections[0].fields[0][0]];
 expect(()=>completedPortalScreen(screen,answers)).toThrow('Answer each questionnaire item');
 await expect(resolveEnrollmentFoundation(user,{clientId:41,foundationKey:'portal-psc-17',audience:'self'})).rejects.toMatchObject({status:404});
 await expect(requirePortalScreenRecipient(portalScreenDefinition('portal-psc-17'),{client_id:41,agency_id:2},5,'client',true)).rejects.toMatchObject({status:400});
});

it('offers GAD-7 for adult self-report and uses the existing score from the submitted answers',async()=>{
 clientAccess.mockResolvedValue({id:41,agency_id:2,date_of_birth:'1990-06-15'});
 const screen=await resolveEnrollmentFoundation(user,{clientId:41,foundationKey:'portal-gad-7',audience:'self'});
 expect(screen.sections[0].fields).toHaveLength(7);
 expect(completedPortalScreen(screen,Object.fromEntries(screen.sections[0].fields.map(([key])=>[key,'3']))))
   .toEqual({instrumentKey:'gad7',total:21});
 await expect(resolveEnrollmentFoundation(user,{clientId:41,foundationKey:'portal-gad-7',audience:'self',service:'tutoring'}))
   .rejects.toMatchObject({status:404});
 await expect(requirePortalScreenRecipient(portalScreenDefinition('portal-gad-7'),{client_id:41,agency_id:2},5,'client',false)).rejects.toMatchObject({status:400});
});
