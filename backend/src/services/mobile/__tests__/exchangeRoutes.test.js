import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({access:vi.fn(),scope:vi.fn(),list:vi.fn(),detail:vi.fn(),request:vi.fn(),mine:vi.fn()}));
vi.mock('../toolAccess.service.js',()=>({mobileToolAccess:mocks.access}));
vi.mock('../../../utils/agencyAccessContext.js',()=>({runWithAgencyAccess:(_agency,fn)=>fn()}));
vi.mock('../../../services/clientExchange.service.js',()=>({getExchangeListingScope:mocks.scope}));
vi.mock('../../../controllers/clientExchange.controller.js',()=>({listListings:mocks.list,getListing:mocks.detail,createRequest:mocks.request,listMyRequests:mocks.mine}));
import router from '../../../routes/mobileExchange.routes.js';
const action=(path,method='get')=>router.stack.find(layer=>layer.route?.path===path&&layer.route.methods[method]).route.stack[0].handle;
const response=()=>({set:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue({agency:{id:10},actor:{id:7,role:'provider'}});mocks.scope.mockResolvedValue({agencyId:10});});
it('denies a guessed listing in another tenant before invoking its canonical controller',async()=>{mocks.scope.mockResolvedValue({agencyId:20});const next=vi.fn();await action('/listings/:id')({query:{agencyId:'10'},params:{id:'5'}},response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404}));expect(mocks.detail).not.toHaveBeenCalled();});
it('reuses canonical requesting rules with only allowed request fields and the current actor',async()=>{const req={quickView:{mobileDeviceSessionId:4},query:{agencyId:'10',userId:99},params:{id:'5'},body:{message:'I have availability.',requestingProviderUserId:99,agencyId:20,acknowledgedWarnings:['canonical-fingerprint',{}]}};await action('/listings/:id/requests','post')(req,response(),vi.fn());expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({user:{id:7,role:'provider'},body:{message:'I have availability.',acknowledgedWarnings:['canonical-fingerprint']},query:{agencyId:'10',status:undefined}}),expect.anything(),expect.anything());});
it('requires an explicit authorized agency, even on read-only requests',async()=>{const next=vi.fn();await action('/listings')({query:{},params:{}},response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));expect(mocks.access).not.toHaveBeenCalled();});

it('does not substitute global user identity when a different agency is selected',async()=>{mocks.access.mockResolvedValue({agency:{id:20},actor:{id:7,role:'provider',has_provider_access:true,agencyAccess:{agencyId:20,role:'provider'}}});const req={query:{agencyId:'20',userId:'99'},params:{},quickView:{mobileDeviceSessionId:4}};await action('/listings')(req,response(),vi.fn());expect(mocks.list.mock.calls[0][0].user).toMatchObject({id:7,role:'provider',agencyAccess:{agencyId:20}});expect(mocks.list.mock.calls[0][0].query.agencyId).toBe('20');});

it('requests the current viewer personal fit on the scoped list and ignores client-controlled identity flags',async()=>{const req={query:{agencyId:'10',viewerUserId:'99',personalFit:'false'},params:{}};await action('/listings')(req,response(),vi.fn());expect(mocks.list.mock.calls[0][0]).toMatchObject({mobileExchangePersonalFit:true,user:{id:7},query:{agencyId:'10'}});expect(req.query.viewerUserId).toBeUndefined();});
