import {it,expect,vi,beforeEach} from 'vitest';
import sharp from 'sharp';
const mocks=vi.hoisted(()=>({recipient:vi.fn(),requireSection:vi.fn(),clients:vi.fn(),assign:vi.fn(),execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),save:vi.fn(),delete:vi.fn()}));
vi.mock('../providerUpdateReview.controller.js',()=>({reviewRecipient:mocks.recipient,requireSection:mocks.requireSection}));
vi.mock('../../services/providerUpdate.service.js',()=>({listFallActionClientsForProvider:mocks.clients}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>mocks}}));
vi.mock('../../services/technologySupport.service.js',()=>({assignTechnologyTicket:mocks.assign}));
vi.mock('../../utils/supportTicketCrypto.js',()=>({prepareEncryptedTicketText:()=>({encrypted:true,plain:null,ciphertext:'encrypted',iv:'iv',authTag:'tag',keyId:'key'})}));
vi.mock('../../services/storage.service.js',()=>({default:{getGCSBucket:async()=>({file:()=>({save:mocks.save,delete:mocks.delete})})}}));
import {submitUpdateHelp} from '../providerUpdateHelp.controller.js';
beforeEach(()=>{vi.clearAllMocks();mocks.recipient.mockResolvedValue({id:5,agency_id:2,provider_user_id:465,token:'test'});mocks.execute.mockResolvedValue([{}]);});
const req=()=>({body:{requestId:'12345678-1234-1234-1234-123456789abc',subject:'Help',question:'My screen is stuck',agencyId:999,userId:999},params:{token:'test'},files:[]});
const res=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
it('refuses submission from a read-only preview',async()=>{mocks.recipient.mockResolvedValue({previewOnly:true});const next=vi.fn();await submitUpdateHelp(req(),res(),next);expect(next.mock.calls[0][0].status).toBe(403);expect(mocks.beginTransaction).not.toHaveBeenCalled();});
it('creates a technology ticket scoped to the recipient and stores screenshots privately',async()=>{
 mocks.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{insertId:70}]).mockResolvedValue([{}]);
 const request=req();request.files=[{buffer:await sharp({create:{width:1,height:1,channels:3,background:'#ffffff'}}).png().toBuffer()}];
 const response=res(),next=vi.fn();await submitUpdateHelp(request,response,next);
 expect(next).not.toHaveBeenCalled();expect(mocks.execute.mock.calls[2][1].slice(0,3)).toEqual([2,2,465]);expect(mocks.execute.mock.calls[2][0]).toContain("'technology'");expect(mocks.assign).toHaveBeenCalledWith({ticketId:70,agencyId:2},mocks);expect(mocks.save).toHaveBeenCalledOnce();expect(mocks.commit).toHaveBeenCalledOnce();expect(response.json).toHaveBeenCalledWith({ticketId:70,topic:'technology'});
});
it('returns an existing ticket on retry without creating another',async()=>{mocks.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ticket_id:70}]]);const response=res();await submitUpdateHelp(req(),response,vi.fn());expect(response.json).toHaveBeenCalledWith({ticketId:70,topic:'technology'});expect(mocks.assign).not.toHaveBeenCalled();expect(mocks.commit).not.toHaveBeenCalled();});

it('links a client ticket to the assigned client and school, ignoring caller-supplied scope',async()=>{
 mocks.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{insertId:71}]).mockResolvedValue([{}]);
 mocks.clients.mockResolvedValue([{id:12,schoolOrganizationId:280}]);
 const request=req();Object.assign(request.body,{clientId:12,schoolOrganizationId:999});
 const response=res(),next=vi.fn();await submitUpdateHelp(request,response,next);
 expect(next).not.toHaveBeenCalled();expect(mocks.requireSection).toHaveBeenCalledWith(expect.objectContaining({id:5}),'client_fall_update');
 expect(mocks.clients).toHaveBeenCalledWith(465,2);expect(mocks.execute.mock.calls[2][1].slice(0,4)).toEqual([2,280,12,465]);
 expect(mocks.execute.mock.calls[2][1][5]).toBeNull();expect(mocks.execute.mock.calls[2][0]).toContain("'general'");
 expect(mocks.assign).not.toHaveBeenCalled();expect(response.json).toHaveBeenCalledWith({ticketId:71,topic:'general',clientId:12});
});
it('rejects a client outside this provider update and rolls back without creating a ticket',async()=>{
 mocks.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);mocks.clients.mockResolvedValue([{id:12,schoolOrganizationId:280}]);
 const request=req();request.body.clientId=13;const next=vi.fn();await submitUpdateHelp(request,res(),next);
 expect(next.mock.calls[0][0].status).toBe(403);expect(mocks.execute).toHaveBeenCalledTimes(2);expect(mocks.rollback).toHaveBeenCalledOnce();expect(mocks.commit).not.toHaveBeenCalled();
});
it('keeps a client ticket retry idempotent, but rejects reusing its request ID for another client',async()=>{
 for(const clientId of [12,13]){
  mocks.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ticket_id:71,client_id:12,topic:'general'}]]);
  const request=req();request.body.clientId=clientId;const next=vi.fn(),response=res();await submitUpdateHelp(request,response,next);
  if(clientId===12){expect(next).not.toHaveBeenCalled();expect(response.json).toHaveBeenCalledWith({ticketId:71,topic:'general'});}
  else expect(next.mock.calls[0][0].status).toBe(409);
 }
 expect(mocks.commit).not.toHaveBeenCalled();
});
