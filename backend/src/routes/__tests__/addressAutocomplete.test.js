import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
const mocks=vi.hoisted(()=>({auth:vi.fn(),active:vi.fn(),suggest:vi.fn(),select:vi.fn(),contextSuggest:vi.fn(),contextSelect:vi.fn()}));
vi.mock('../../middleware/auth.middleware.js',()=>({authenticate:mocks.auth,requireActiveStatus:mocks.active}));
vi.mock('../../controllers/addressAutocomplete.controller.js',()=>({addressAutocompleteHandlers:{suggest:mocks.suggest,select:mocks.select,contextSuggest:mocks.contextSuggest,contextSelect:mocks.contextSelect}}));
import router from '../addressAutocomplete.routes.js';
describe('lookup routing boundaries',()=>{
 it('puts normal login and active account checks before both authenticated provider actions',()=>{for(const action of ['suggest','select']){const stack=router.stack.find(x=>x.route?.path===`/${action}`).route.stack;expect(stack.map(x=>x.handle).slice(0,2)).toEqual([mocks.auth,mocks.active]);expect(stack.at(-1).handle).toBe(mocks[action]);}});
 it('makes only active-key controller routes public and gives every lookup a separate rate limit',()=>{for(const action of ['suggest','select']){const route=router.stack.find(x=>x.route?.path===`/intake/:publicKey/${action}`).route;expect(route.methods).toEqual({post:true});expect(route.stack).toHaveLength(2);expect(route.stack.at(-1).handle).toBe(mocks[action]);expect(route.stack.some(x=>x.handle===mocks.auth)).toBe(false);}expect(router.stack.filter(x=>x.route)).toHaveLength(6);});
 it('exposes separate token-validated context handlers with rate limits and no generic provider proxy',()=>{for(const action of ['suggest','select']){const route=router.stack.find(x=>x.route?.path===`/context/${action}`).route;expect(route.methods).toEqual({post:true});expect(route.stack).toHaveLength(2);expect(route.stack.at(-1).handle).toBe(mocks[action==='suggest'?'contextSuggest':'contextSelect']);}});
 it('mounts before catch-all authentication without exempting arbitrary new public APIs',()=>{const server=readFileSync(new URL('../../server.js',import.meta.url),'utf8');expect(server.indexOf("app.use('/api/address-lookup'")).toBeLessThan(server.indexOf("app.use('/api', userCommunicationRoutes)"));});
});
