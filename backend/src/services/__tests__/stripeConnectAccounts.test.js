import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({create:vi.fn(),legacyCreate:vi.fn(),retrieve:vi.fn()}));
vi.mock('stripe',()=>({default:class{constructor(){this.v2={core:{accounts:{create:mocks.create}}};this.accounts={create:mocks.legacyCreate,retrieve:mocks.retrieve};}}}));
vi.mock('../medicalServiceFees.service.js',()=>({quoteAgencyCardFee:vi.fn()}));
import Payments,{CONNECT_ACCOUNT_API_VERSION,stripeConnectStatus} from '../stripePayments.service.js';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('STRIPE_SECRET_KEY','sk_test_SYNTHETIC');mocks.create.mockResolvedValue({id:'acct_synthetic'});mocks.retrieve.mockResolvedValue({id:'acct_synthetic',business_type:'non_profit'});});
it('uses the supported Managed Risk request and preserves the existing account view',async()=>{
 const account=await Payments.createConnectAccount({email:'admin@example.com',businessName:'Example charity',businessUrl:'https://example.com',businessType:'non_profit',metadata:{agency_id:'434'},idempotencyKey:'agency-434'});
 expect(mocks.legacyCreate).not.toHaveBeenCalled();expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({dashboard:'express',contact_email:'admin@example.com',identity:{country:'US',entity_type:'non_profit'},defaults:expect.objectContaining({responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}}),configuration:{merchant:{capabilities:{card_payments:{requested:true}}}},metadata:{agency_id:'434'}}),{apiVersion:CONNECT_ACCOUNT_API_VERSION,idempotencyKey:'agency-434'});
 expect(mocks.retrieve).toHaveBeenCalledWith('acct_synthetic');expect(account.business_type).toBe('non_profit');
});
it('lets the administrator select unknown legal structure and does not attest identity or terms',async()=>{
 await Payments.createConnectAccount({email:'admin@example.com',businessName:'Example agency'});
 const input=mocks.create.mock.calls[0][0];expect(input).not.toHaveProperty('type');expect(input.identity).toEqual({country:'US'});expect(input.identity).not.toHaveProperty('attestations');expect(input.identity).not.toHaveProperty('business_details');
});
it('fails before processor creation when contact or classification is invalid',async()=>{
 await expect(Payments.createConnectAccount({})).rejects.toThrow(/email/);
 await expect(Payments.createConnectAccount({email:'admin@example.com',businessType:'invented'})).rejects.toThrow(/business type/);expect(mocks.create).not.toHaveBeenCalled();
});
it.each([[false,false,'pending'],[true,false,'pending'],[false,true,'pending'],[true,true,'active']])('requires both charges %s and payouts %s for %s',(charges,payouts,status)=>{expect(stripeConnectStatus({charges_enabled:charges,payouts_enabled:payouts})).toBe(status);});
