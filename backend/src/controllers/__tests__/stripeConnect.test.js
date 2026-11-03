import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),connectionQuery:vi.fn(),release:vi.fn(),getConnection:vi.fn(),agency:vi.fn(),create:vi.fn(),link:vi.fn(),retrieve:vi.fn(),configured:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{query:mocks.query,getConnection:mocks.getConnection}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:mocks.agency}}));
vi.mock('../../services/stripePayments.service.js',()=>({default:{createConnectAccount:mocks.create,createAccountLink:mocks.link,retrieveConnectAccount:mocks.retrieve},isStripeConfigured:mocks.configured,stripeConnectStatus:a=>a.charges_enabled&&a.payouts_enabled?'active':'pending'}));
import {startConnect,getStripeStatus} from '../stripeConnect.controller.js';
const response=()=>{const res={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);return res;};
const request=(id=6)=>({user:{id:538,role:'admin',email:'admin@example.com'},params:{agencyId:String(id)}});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('FRONTEND_URL','https://portal.example.com');vi.stubEnv('STRIPE_CONNECT_RETURN_URL','https://wrong.example.com/other-tenant');mocks.configured.mockReturnValue(true);
 mocks.agency.mockResolvedValue({id:6,name:'Example agency',slug:'example',website_url:'https://example.com'});
 mocks.getConnection.mockResolvedValue({query:mocks.connectionQuery,release:mocks.release});
 mocks.connectionQuery.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT agency_id')?[[]]:[{affectedRows:1}]);
 mocks.create.mockResolvedValue({id:'acct_new'});mocks.link.mockResolvedValue({url:'https://connect.stripe.com/setup/synthetic'});
});
it('creates a tenant-bound account with stable retry identity and returns to that tenant',async()=>{
 const res=response(),next=vi.fn();await startConnect(request(),res,next);expect(next).not.toHaveBeenCalled();
 expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({email:'admin@example.com',metadata:{agency_id:'6',agency_name:'Example agency'},idempotencyKey:'agency-connect-v2-6'}));
 expect(mocks.link).toHaveBeenCalledWith({connectedAccountId:'acct_new',returnUrl:'https://portal.example.com/example/admin/family-billing?tab=setup&agencyId=6&stripe=connected',refreshUrl:'https://portal.example.com/example/admin/family-billing?tab=setup&agencyId=6&stripe=refresh'});
 expect(mocks.connectionQuery).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)',['stripe-connect:6']);expect(mocks.release).toHaveBeenCalledOnce();
});
it('resumes an existing account without creating or replacing it',async()=>{
 mocks.connectionQuery.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT agency_id')?[[{stripe_connect_account_id:'acct_retained'}]]:[{affectedRows:1}]);
 const res=response();await startConnect(request(),res,vi.fn());expect(mocks.create).not.toHaveBeenCalled();expect(mocks.link.mock.calls[0][0].connectedAccountId).toBe('acct_retained');
});
it('does not start another creation while the tenant lock is held',async()=>{
 mocks.connectionQuery.mockResolvedValue([[{acquired:0}]]);const res=response();await startConnect(request(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(409);expect(mocks.create).not.toHaveBeenCalled();expect(mocks.release).toHaveBeenCalledOnce();
});
it('releases the tenant lock on processor failure without recording a made-up account',async()=>{
 const error=Error('Processor unavailable');mocks.create.mockRejectedValue(error);const next=vi.fn();await startConnect(request(),response(),next);expect(next).toHaveBeenCalledWith(error);expect(mocks.connectionQuery.mock.calls.some(([sql])=>sql.includes('SET stripe_connect_account_id'))).toBe(false);expect(mocks.release).toHaveBeenCalledOnce();
});
it('keeps a charges-only account pending so payout verification can continue',async()=>{
 mocks.query.mockResolvedValue([[{stripe_connect_account_id:'acct_retained',stripe_connect_status:'active'}]]);mocks.retrieve.mockResolvedValue({charges_enabled:true,payouts_enabled:false,details_submitted:true});const res=response();await getStripeStatus(request(),res,vi.fn());expect(res.json).toHaveBeenCalledWith(expect.objectContaining({status:'pending',chargesEnabled:true,payoutsEnabled:false}));expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('SET stripe_connect_account_id'),['acct_retained','pending',6]);
});
