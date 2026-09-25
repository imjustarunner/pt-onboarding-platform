import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({create:vi.fn(),retrieve:vi.fn(),refund:vi.fn(),quote:vi.fn()}));
vi.mock('stripe',()=>({default:class {constructor(){this.paymentIntents={create:mocks.create,retrieve:mocks.retrieve};this.refunds={create:mocks.refund};}}}));
vi.mock('../medicalServiceFees.service.js',()=>({quoteAgencyCardFee:mocks.quote}));
import Stripe from '../stripePayments.service.js';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('STRIPE_SECRET_KEY','sk_test_SYNTHETIC_ONLY');mocks.quote.mockResolvedValue({feeCents:25,quoteId:7});mocks.create.mockResolvedValue({id:'pi_synthetic'});mocks.retrieve.mockResolvedValue({id:'pi_synthetic',application_fee_amount:25});});
describe('Stripe agency application fee integration',()=>{
 it('keeps the patient amount intact, scopes card fees and forwards the stable reference',async()=>{
  await Stripe.chargePaymentMethod({customerId:'cus_test',paymentMethodId:'pm_test',amountCents:2500,metadata:{agency_id:'1'},connectedAccountId:'acct_test',idempotencyKey:'stable-test'});
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({amount:2500,application_fee_amount:25,payment_method_types:['card'],metadata:{agency_id:'1',agency_fee_quote_id:'7'}}),{stripeAccount:'acct_test',idempotencyKey:'stable-test'});
 });
 it('uses the same fee rule for on-session payments and refuses stacked application fees',async()=>{
  await Stripe.createPaymentIntent({amountCents:2500,metadata:{agency_id:'1'},connectedAccountId:'acct_test',idempotencyKey:'stable-test'});expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('automatic_payment_methods');
  await expect(Stripe.createPaymentIntent({amountCents:2500,applicationFeeAmountCents:10,connectedAccountId:'acct_test'})).rejects.toThrow(/Two application fee/);
 });
 it('requests proportional application-fee refunds only when a fee existed',async()=>{
  await Stripe.refundPaymentIntent({paymentIntentId:'pi_test',amountCents:1000,connectedAccountId:'acct_test',idempotencyKey:'refund-test'});expect(mocks.refund.mock.calls[0][0]).toMatchObject({amount:1000,refund_application_fee:true});
  mocks.retrieve.mockResolvedValue({application_fee_amount:null});await Stripe.refundPaymentIntent({paymentIntentId:'pi_test',amountCents:1000,connectedAccountId:'acct_test',idempotencyKey:'refund-two'});expect(mocks.refund.mock.calls[1][0]).not.toHaveProperty('refund_application_fee');
 });
});
