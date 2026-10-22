import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../services/clientAccountSupportAccess.service.js',()=>({requireClientAccountSupport:vi.fn()}));
vi.mock('../../services/clientCareBillingSummary.service.js',()=>({clientCareBillingSummary:vi.fn()}));
vi.mock('../../models/GuardianPaymentCard.model.js',()=>({decodePaymentCard:vi.fn(row=>({...row,card_brand:'Visa',card_last4:'4242',stripe_payment_method_id:'secret-token',cardholder_name:'Private name'}))}));
vi.mock('../../services/familyBillingPolicy.service.js',()=>({requireResponsiblePayer:vi.fn(),auditBilling:vi.fn()}));
vi.mock('../../services/clientPortalContext.service.js',()=>({resolveClientPortalContext:vi.fn(async()=>({portal:{slug:'test'}})),clientPortalAppUrl:vi.fn(()=> 'https://example.test/test/guardian?panel=billing')}));
import pool from '../../config/database.js';
import { requireClientAccountSupport } from '../../services/clientAccountSupportAccess.service.js';
import { clientCareBillingSummary } from '../../services/clientCareBillingSummary.service.js';
import { requireResponsiblePayer } from '../../services/familyBillingPolicy.service.js';
import { getClientAccountSupport } from '../clientAccountSupport.controller.js';
const req=()=>({user:{id:10,role:'support'},params:{id:20}});
const res=()=>({set:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{
  vi.clearAllMocks();requireClientAccountSupport.mockResolvedValue({id:20,agency_id:2,client_type:'clinical'});
  clientCareBillingSummary.mockResolvedValue({balance:{payableCents:2500,hasItemsUnderReview:true}});
  requireResponsiblePayer.mockResolvedValue({});pool.execute.mockResolvedValue([[{guardian_user_id:30,first_name:'Parent',card_id:40,agency_id:2,private_payload:'encrypted-secret',payment_provider:'STRIPE'}]]);
});
it('returns current balance and masked card data without history, claims, or payment credentials',async()=>{
  const response=res(),next=vi.fn();await getClientAccountSupport(req(),response,next);
  expect(next).not.toHaveBeenCalled();expect(response.set).toHaveBeenCalledWith('Cache-Control','no-store');
  expect(response.json.mock.calls[0][0]).toEqual({balance:{payableCents:2500,hasItemsUnderReview:true},payers:[{name:'Parent',cardOnFile:true,card:{brand:'Visa',last4:'4242',verificationRequired:false}}],portalUrl:'https://example.test/test/guardian?panel=billing'});
  expect(pool.execute.mock.calls[0][1]).toEqual([2,20]);
  expect(pool.execute.mock.calls[0][0]).toContain('c.guardian_user_id=p.guardian_user_id AND c.agency_id=p.agency_id AND c.is_active=1');
});
it('does not expose another payer after their client permission was revoked',async()=>{
  requireResponsiblePayer.mockRejectedValue(Object.assign(new Error('Revoked'),{status:403}));
  const response=res();await getClientAccountSupport(req(),response,vi.fn());expect(response.json.mock.calls[0][0].payers).toEqual([]);
});
it('shows a payer with no assigned card without reading private card data',async()=>{
  pool.execute.mockResolvedValue([[{guardian_user_id:30,first_name:'Parent',card_id:null}]]);
  const response=res();await getClientAccountSupport(req(),response,vi.fn());expect(response.json.mock.calls[0][0].payers).toEqual([{name:'Parent',cardOnFile:false,card:null}]);
});
it('denies cross-agency or revoked support before reading balances or cards',async()=>{
  requireClientAccountSupport.mockRejectedValue(Object.assign(new Error('Denied'),{status:403}));
  const next=vi.fn();await getClientAccountSupport(req(),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));
  expect(clientCareBillingSummary).not.toHaveBeenCalled();expect(pool.execute).not.toHaveBeenCalled();
});
