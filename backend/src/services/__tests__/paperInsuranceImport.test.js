import {it,expect,vi} from 'vitest';
vi.mock('../../models/Client.model.js',()=>({default:{findById:vi.fn(),update:vi.fn()}}));
vi.mock('../../models/ClientGuardianIntakeProfile.model.js',()=>({default:{}}));
vi.mock('../demographicsImport.service.js',()=>({decryptDemographicsPayload:vi.fn(),encryptDemographicsPayload:vi.fn(),isDemographicsEncryptionConfigured:()=>false}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:vi.fn(),writeClientInsurance:vi.fn(),patientFromDemographics:()=>({firstName:'Jordan',lastName:'Example',dateOfBirth:'2023-09-20'})}));
import Client from '../../models/Client.model.js';import {readClientInsurance,writeClientInsurance} from '../clientInsurance.service.js';
import {applyPaperPacketDemographicsFromText} from '../paperPacketDemographics.service.js';
it('adds paper secondary despite existing primary and preserves assignment and policy source metadata',async()=>{
 Client.findById.mockResolvedValue({id:4,agency_id:2,full_name:'Jordan Example'});
 const primary={insurerName:'Staff saved primary',memberId:'STAFF-PRIMARY',relationshipToSubscriber:'self'};
 readClientInsurance.mockResolvedValue({primary,secondary:null,profileId:11,coverageSources:{primary:{profileId:11,slot:'primary'}},acceptAssignment:true,patient:{firstName:'Jordan',lastName:'Example',dateOfBirth:'2023-09-20'}});
 await applyPaperPacketDemographicsFromText({clientId:4,ocrText:'Primary Insurance CHAMPVA Secondary Insurance Colorado Medicaid\nPolicy Holder Taylor Example Secondary Holder Morgan Example\nMember ID PRIMARY-TEST Secondary ID A123456'});
 expect(writeClientInsurance).toHaveBeenCalledWith(expect.objectContaining({primary,secondary:expect.objectContaining({memberId:'A123456',paperSubscriberName:'Morgan Example',subscriberFirstName:'Jordan',relationshipToSubscriber:'self'}),profileId:11,coverageSources:{primary:{profileId:11,slot:'primary'}},acceptAssignment:true,verifiedForClaims:false}));
});
it('does not reset verified saved coverage when the packet adds no empty coverage position',async()=>{
 writeClientInsurance.mockClear();Client.findById.mockResolvedValue({id:4,agency_id:2,full_name:'Jordan Example'});
 readClientInsurance.mockResolvedValue({primary:{insurerName:'Saved policy',memberId:'SAVED'},verifiedForClaims:true});
 await applyPaperPacketDemographicsFromText({clientId:4,ocrText:'Primary Insurance CHAMPVA\nMember ID PRIMARY-TEST'});
 expect(writeClientInsurance).not.toHaveBeenCalled();
});
