import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../services/addressEditContext.service.js',()=>({validateAddressEditContext:vi.fn()}));
vi.mock('../../models/IntakeLink.model.js',()=>({default:{findByPublicKey:vi.fn()}}));
vi.mock('../../services/addressAutocomplete.service.js',()=>({addressAutocomplete:{suggest:vi.fn(),select:vi.fn()}}));
import {createAddressAutocompleteHandlers} from '../addressAutocomplete.controller.js';
let service,links,handlers,validateContext;
const keys=['office-intake-450-en-876e98bf5af05de5','office-intake-450-es-1cadfe975924387d','f243e3ac1cf550565687a32028d7ff535ad4965b7d47ce60','a816de239557a6bbc0e953e085f6fd235c494f4ab936fc7e'];
beforeEach(()=>{service={suggest:vi.fn().mockResolvedValue([]),select:vi.fn().mockResolvedValue({street:'Public address'})};links={findByPublicKey:vi.fn().mockResolvedValue({is_active:1})};validateContext=vi.fn().mockResolvedValue('prehire:verified:100');handlers=createAddressAutocompleteHandlers({service,links,validateContext});});
async function call(req={},action='suggest'){const res={set:vi.fn(),json:vi.fn(),status:vi.fn().mockReturnThis()};await handlers[action]({params:{},body:{query:'Public address',sessionToken:'random UUID',locale:'es',clientName:'DO NOT FORWARD',clientId:2474},headers:{},ip:'192.0.2.10',...req},res);return res;}
describe('address authorization and safe error responses',()=>{
 it.each(keys)('verifies active master form %s server-side and forwards only minimal fields',async publicKey=>{const res=await call({params:{publicKey}});expect(links.findByPublicKey).toHaveBeenCalledWith(publicKey);expect(res.status).not.toHaveBeenCalled();expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');const args=service.suggest.mock.calls[0][0];expect(Object.keys(args).sort()).toEqual(['locale','query','scope','sessionToken']);expect(args.scope).toMatch(/^intake:[a-f0-9]{64}$/);expect(JSON.stringify(args)).not.toContain(publicKey);});
 it('rejects inactive, unknown and unresolved issued keys before using the provider',async()=>{for(const link of [null,{is_active:0},{is_active:false}]){links.findByPublicKey.mockResolvedValue(link);const res=await call({params:{publicKey:'unknown'}});expect(res.status).toHaveBeenCalledWith(404);}expect(service.suggest).not.toHaveBeenCalled();});
 it('requires a signed-in account on staff routes and isolates selection permits per account',async()=>{expect((await call()).status).toHaveBeenCalledWith(401);expect(service.suggest).not.toHaveBeenCalled();await call({user:{id:42}});expect(service.suggest.mock.calls[0][0].scope).toBe('user:42');await call({user:{id:43},body:{selectionToken:'opaque',locale:'en',clientId:2474}},'select');expect(service.select).toHaveBeenCalledWith({scope:'user:43',selectionToken:'opaque',locale:'en'});});
 it('separates public permits by form and request origin',async()=>{await call({params:{publicKey:'en'}});await call({params:{publicKey:'es'}});await call({params:{publicKey:'en'},ip:'192.0.2.11'});expect(new Set(service.suggest.mock.calls.map(([args])=>args.scope)).size).toBe(3);});
 it('does not expose upstream response bodies, URLs, query text or API keys',async()=>{service.suggest.mockRejectedValue(Object.assign(new Error('https://provider.test/secret?key=private&address=private'),{status:400,code:'BAD_PROVIDER',response:{data:'private'}}));const res=await call({user:{id:42}});expect(res.status).toHaveBeenCalledWith(503);expect(res.json).toHaveBeenCalledWith({error:{code:'ADDRESS_LOOKUP_UNAVAILABLE',message:'Address suggestions are unavailable. Enter the address manually.'}});});
 it('requires the actual family session on cookie-only handlers and cannot substitute a workplace principal',async()=>{
  const missing=await call({user:{id:42}},'familySuggest');expect(missing.status).toHaveBeenCalledWith(401);expect(service.suggest).not.toHaveBeenCalled();
  await call({family:{userId:52,agencyId:450},user:{id:42}},'familySuggest');expect(service.suggest.mock.calls[0][0].scope).toBe('family:450:52');
  const normal=await call({family:{userId:52,agencyId:450}},'suggest');expect(normal.status).toHaveBeenCalledWith(401);expect(service.suggest).toHaveBeenCalledOnce();
 });
 it('binds EHR selections to the already validated practice and current actual user',async()=>{
  await call({user:{id:42},auricwellPreview:{agencyId:450}});await call({user:{id:42},auricwellPreview:{agencyId:451}});expect(service.suggest.mock.calls.map(([args])=>args.scope)).toEqual(['practice:450:user:42','practice:451:user:42']);
 });
 it('validates existing token-bound context before provider use without forwarding tokens or identities',async()=>{
  const publicContext={kind:'prehire',token:'private-existing-token'},res=await call({body:{publicContext,query:'Public street',sessionToken:'random UUID',locale:'es',clientId:100}},'contextSuggest');
  expect(res.status).not.toHaveBeenCalled();expect(validateContext).toHaveBeenCalledWith(publicContext);expect(links.findByPublicKey).not.toHaveBeenCalled();const args=service.suggest.mock.calls[0][0];expect(args.scope).toMatch(/^context:[a-f0-9]{64}$/);expect(Object.keys(args).sort()).toEqual(['locale','query','scope','sessionToken']);expect(JSON.stringify(args)).not.toContain('private-existing-token');
 });
 it('does not accept missing/expired/locked context tokens or reuse an intake permission',async()=>{
  validateContext.mockRejectedValue(Object.assign(new Error('private validator details'),{statusCode:401}));const res=await call({params:{publicKey:'some-active-intake'},body:{publicContext:{kind:'unknown',token:'expired'}}},'contextSuggest');expect(res.status).toHaveBeenCalledWith(404);expect(service.suggest).not.toHaveBeenCalled();expect(links.findByPublicKey).not.toHaveBeenCalled();expect(JSON.stringify(res.json.mock.calls)).not.toContain('private validator details');
 });
 it('separates permits for the same guest record when its token or source changes',async()=>{
  for(const token of ['first-token','second-token'])await call({body:{publicContext:{kind:'school-reinit',token},query:'Public street',sessionToken:'random UUID'}},'contextSuggest');expect(new Set(service.suggest.mock.calls.map(([args])=>args.scope)).size).toBe(2);
 });
 it('exposes only known local validation errors without provider details',async()=>{service.select.mockRejectedValue(Object.assign(new Error('Choose an address suggestion again.'),{status:400,code:'ADDRESS_SELECTION_EXPIRED'}));const res=await call({user:{id:42}},'select');expect(res.status).toHaveBeenCalledWith(400);expect(res.json).toHaveBeenCalledWith({error:{code:'ADDRESS_SELECTION_EXPIRED',message:'Choose an address suggestion again.'}});});
});
