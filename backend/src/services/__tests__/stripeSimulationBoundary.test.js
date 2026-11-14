import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({stripe:vi.fn(),gateway:vi.fn(),create:vi.fn(),fee:vi.fn(),configuration:vi.fn()}));
vi.mock('stripe',()=>({default:mocks.stripe}));
vi.mock('../medicalServiceFees.service.js',()=>({quoteAgencyCardFee:mocks.fee}));
vi.mock('../stripePaymentContext.service.js',()=>({stripePaymentConfiguration:mocks.configuration}));
vi.mock('../qaPaymentSimulator.service.js',()=>({qaSimulationGateway:mocks.gateway}));
import Stripe from '../stripePayments.service.js';
beforeEach(()=>{vi.clearAllMocks();mocks.gateway.mockResolvedValue({qa_simulated:true,paymentIntents:{create:mocks.create}});mocks.create.mockResolvedValue({id:'qa_pi_saved',qa_simulated:true,status:'succeeded'});});
it('routes a QA card charge to the simulator without constructing Stripe or a real fee quote',async()=>{
 const result=await Stripe.chargePaymentMethod({customerId:'qa_customer_453_1759',paymentMethodId:'qa_pm_1',connectedAccountId:'qa_simulator_453',amountCents:5000,metadata:{agency_id:'453',family_ledger_payment_id:'7'},idempotencyKey:'family-ledger:453:7'});
 expect(result.qa_simulated).toBe(true);expect(mocks.gateway).toHaveBeenCalledWith('qa_simulator_453');expect(mocks.stripe).not.toHaveBeenCalled();expect(mocks.configuration).not.toHaveBeenCalled();expect(mocks.fee).not.toHaveBeenCalled();
 expect(mocks.create.mock.calls[0][0]).toMatchObject({amount:5000,customer:'qa_customer_453_1759',confirm:true});expect(mocks.create.mock.calls[0][1].idempotencyKey).toBe('family-ledger:453:7');
});
it('fails closed when the QA adapter rejects its merchant rather than falling through to live Stripe',async()=>{
 mocks.gateway.mockRejectedValue(Object.assign(new Error('Not a QA organization'),{status:403}));
 await expect(Stripe.chargePaymentMethod({connectedAccountId:'qa_simulator_6',amountCents:5000})).rejects.toHaveProperty('status',403);expect(mocks.stripe).not.toHaveBeenCalled();expect(mocks.fee).not.toHaveBeenCalled();
});
