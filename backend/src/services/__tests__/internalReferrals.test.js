vi.mock('../clientRecordAccess.service.js',()=>({providerHasAssignedClientAccess:vi.fn(async()=>false)}));
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),transaction:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),client:vi.fn(),update:vi.fn(),history:vi.fn(),acceptance:vi.fn(),announce:vi.fn()}));
vi.mock('../../config/database.js',()=>({onTableWrite:vi.fn(),default:{execute:mocks.execute,getConnection:async()=>({execute:mocks.transaction,beginTransaction:mocks.begin,commit:mocks.commit,rollback:mocks.rollback,release:mocks.release})}}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:mocks.client,update:mocks.update}}));
vi.mock('../../models/ClientStatusHistory.model.js',()=>({default:{create:mocks.history}}));
vi.mock('../officeClientAcceptance.service.js',()=>({recordExchangePosted:mocks.acceptance,recordProviderAssignmentChange:vi.fn()}));
vi.mock('../smartChatGroups.service.js',()=>({announceClientExchangeListing:mocks.announce}));
vi.mock('../clientExchangeSummary.service.js',()=>({loadClientExchangeSummary:vi.fn(async()=>({demographics:{},preferences:{},presentingProblems:[],diagnoses:[]}))}));
vi.mock('../clientExchangeNotifications.service.js',()=>({notifyExchangeMatches:vi.fn(async()=>({sent:1})),notifyExchangeClaim:vi.fn(async()=>{}),notifyExchangeAssignment:vi.fn(async()=>{})}));
import {createListing,createRequest,getListingById,listListings,resolveRequest} from '../clientExchange.service.js';
const listing={id:7,agency_id:2,client_id:3,posted_by_user_id:10,current_provider_user_id:10,status:'open',referral_kind:'additional_service',service_type:'family',target_provider_user_id:12};
beforeEach(()=>{
 vi.clearAllMocks();mocks.client.mockResolvedValue({id:3,agency_id:2,organization_id:2,provider_id:10});
 mocks.execute.mockImplementation(async(sql)=>{
  if(sql.includes('SELECT listing_id'))return [[{listing_id:7}]];
  if(sql.includes('SELECT DISTINCT u.id'))return [[{id:12,first_name:'Sam'}]];
  if(sql.includes('INSERT INTO client_exchange_listings'))return [{insertId:7}];
  if(sql.includes('SELECT id FROM client_exchange_listings'))return [[]];
  if(sql.includes('SELECT l.*'))return [[listing]];
  return [[]];
 });
 mocks.transaction.mockImplementation(async(sql)=>{
  if(sql.includes('SELECT listing_id'))return [[{listing_id:7}]];
  if(sql.includes('SELECT * FROM client_exchange_listings'))return [[listing]];
  if(sql.includes('SELECT * FROM client_exchange_requests'))return [[{id:4,listing_id:7,status:'pending',requesting_provider_user_id:12}]];
  if(sql.startsWith('SELECT u.id'))return [[{id:12}]];
  if(sql.startsWith('SELECT id, agency_id'))return [[{id:3,agency_id:2,provider_id:10}]];
  if(sql.includes('INSERT INTO client_exchange_listings'))return [{insertId:7}];
  if(sql.includes('SELECT * FROM clients'))return [[{id:3,agency_id:2,organization_id:2,provider_id:10}]];
  if(sql.startsWith('SELECT'))return [[]];
  return [{insertId:4}];
 });
});
describe('internal service referrals',()=>{
 it('keeps additional services out of decline metrics and direct referrals out of public announcements',async()=>{
  await createListing({agencyId:2,clientId:3,postedByUserId:10,currentProviderUserId:99,referralKind:'additional_service',serviceType:'family',targetProviderUserId:12,viewerRole:'provider'});
  expect(mocks.acceptance).not.toHaveBeenCalled();expect(mocks.announce).not.toHaveBeenCalled();
  const insert=mocks.transaction.mock.calls.find(([sql])=>sql.includes('INSERT INTO client_exchange_listings'));
  expect(insert[1][3]).toBe(10);expect(insert[1].slice(-3)).toEqual(['additional_service','family',12]);
 });
 it('rejects referring someone else’s client',async()=>{
  await expect(createListing({agencyId:2,clientId:3,postedByUserId:99,viewerRole:'provider'})).rejects.toMatchObject({status:403});
 });
 it('keeps direct referrals private from other exchange browsers',async()=>{
  expect(await getListingById(7,{viewerUserId:15,viewerRole:'provider'})).toBeNull();
  expect(await listListings({agencyId:2,viewerUserId:15,viewerRole:'provider'})).toEqual([]);
  expect(await getListingById(7,{viewerUserId:12,viewerRole:'provider'})).toMatchObject({clientId:null,serviceType:'family'});
 });
 it('adds the family provider and preserves the individual provider on approval',async()=>{
  await resolveRequest({requestId:4,action:'approve',actingUserId:10});
  const writes=mocks.transaction.mock.calls;
  expect(writes.some(([sql])=>sql.startsWith('UPDATE clients'))).toBe(false);
  expect(writes.find(([sql])=>sql.includes('INSERT INTO client_service_assignments'))[1]).toEqual([3,2,12,'family',7,10]);
  const assigned=writes.filter(([sql])=>sql.includes('INSERT INTO client_provider_assignments'));
  expect(assigned.map(([,args])=>args[2])).toEqual([10,12]);
  expect(mocks.commit).toHaveBeenCalledOnce();
 });
 it('uses the normal assignment update inside the transaction for a transfer',async()=>{
  const original=mocks.transaction.getMockImplementation();
  mocks.transaction.mockImplementation(async(sql,args)=>sql.includes('SELECT * FROM client_exchange_listings')?[[{...listing,referral_kind:'transfer'}]]:original(sql,args));
  await resolveRequest({requestId:4,action:'approve',actingUserId:10});
  expect(mocks.transaction).toHaveBeenCalledWith(expect.stringContaining('UPDATE clients SET provider_id'),[12,10,3]);
  expect(mocks.transaction.mock.calls.some(([sql])=>sql.includes('INSERT INTO client_service_assignments'))).toBe(false);
  expect(mocks.commit).toHaveBeenCalledOnce();
 });
 it('rejects a different recipient and rolls back',async()=>{
  mocks.execute.mockImplementation(async()=>[[{id:15}]]);
  await expect(createRequest({listingId:7,requestingProviderUserId:15})).rejects.toMatchObject({status:403});
  expect(mocks.rollback).toHaveBeenCalledOnce();expect(mocks.commit).not.toHaveBeenCalled();
 });
 it('refuses a stale approval after primary assignment changed',async()=>{
  const original=mocks.transaction.getMockImplementation();
  mocks.transaction.mockImplementation(async(sql,args)=>sql.includes('SELECT * FROM clients')?[[{id:3,agency_id:2,provider_id:99}]]:original(sql,args));
  await expect(resolveRequest({requestId:4,action:'approve',actingUserId:10})).rejects.toMatchObject({status:409});
  expect(mocks.rollback).toHaveBeenCalledOnce();expect(mocks.commit).not.toHaveBeenCalled();
 });
 it('refuses a second approval after the referral closed',async()=>{
  const original=mocks.transaction.getMockImplementation();
  mocks.transaction.mockImplementation(async(sql,args)=>sql.includes('SELECT * FROM client_exchange_listings')?[[{...listing,status:'closed'}]]:original(sql,args));
  await expect(resolveRequest({requestId:4,action:'approve',actingUserId:10})).rejects.toMatchObject({status:409});
  expect(mocks.commit).not.toHaveBeenCalled();
 });
});
