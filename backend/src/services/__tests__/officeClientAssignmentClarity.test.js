import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/Client.model.js', () => ({ default: {} }));
vi.mock('../../models/ClientNotes.model.js', () => ({ default: {} }));
vi.mock('../../models/TherapyEnrollmentUnit.model.js', () => ({ default: {} }));
vi.mock('../../models/Appointment.model.js', () => ({ default: {} }));
vi.mock('../clientLifecycleStatus.service.js', () => ({ setClientLifecycleStatus: vi.fn(), LIFECYCLE_STATUS_KEYS: {} }));
vi.mock('../clientExchange.service.js', () => ({ listPendingOfficeClients: vi.fn() }));
vi.mock('../../utils/uploads.js', () => ({ publicUploadsUrlFromStoredPath: () => null }));
import pool from '../../config/database.js';
import { listOfficeClients, listHubProviders } from '../officeClientManagement.service.js';

let services;
beforeEach(() => {
  vi.clearAllMocks();
  services = [{ id: 11, client_id: 4, agency_id: 6, service_kind: 'counseling', label: 'Counseling',
    provider_user_id: 20, first_name: 'Care', last_name: 'Provider', organization_id: 0 }];
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('SELECT c.id, c.initials')) return [[{ id: 4, agency_id: 6, full_name: 'Client', client_type: 'clinical',
      status: 'ACTIVE', client_status_key: 'received', provider_id: null, created_at: '2026-11-15' }]];
    if (sql.includes('SELECT id, name, slug')) return [[{ id: 6, name: 'Client Agency' }]];
    if (sql.includes('FROM client_service_enrollments e')) return [services];
    return [[]];
  });
});

it('recognizes an enrolled service’s provider when legacy provider fields are empty', async () => {
  const { clients, aggregates } = await listOfficeClients({ agencyIds: [6] });
  expect(clients[0].providers).toMatchObject([{ providerId: 20, name: 'Care Provider', agencyId: 6, serviceKind: 'counseling' }]);
  expect(clients[0].nextStep).toEqual({ key: 'schedule', label: 'Schedule first appointment' });
  expect(aggregates.unassigned).toBe(0);
});

it('names the unassigned service when another service already has a provider', async () => {
  services.push({ id: 12, client_id: 4, agency_id: 6, service_kind: 'tutoring', label: 'Reading tutoring', provider_user_id: 0 });
  const { clients } = await listOfficeClients({ agencyIds: [6] });
  expect(clients[0].nextStep).toEqual({ key: 'review_service_assignment', label: 'Review Reading tutoring assignment' });
  expect(clients[0].services).toHaveLength(2);
  expect(clients[0].providers).toHaveLength(1);
});

it('retains generic assignment guidance only for a client with no provider', async () => {
  services[0].provider_user_id = 0;
  const { clients } = await listOfficeClients({ agencyIds: [6] });
  expect(clients[0].nextStep.key).toBe('assign_provider');
});

it('deduplicates the same provider across multiple enrolled services', async () => {
  services.push({ ...services[0], id: 12, service_kind: 'coaching', label: 'Coaching' });
  const { clients } = await listOfficeClients({ agencyIds: [6] });
  expect(clients[0].providers).toHaveLength(1);
  expect(clients[0].services).toHaveLength(2);
});

it('does not truncate the searchable provider catalog to the first 200 providers', async () => {
  await listHubProviders({ agencyIds: [6] });
  const [sql, params] = pool.execute.mock.calls.find(([sql]) => sql.includes('GROUP_CONCAT(DISTINCT ua.agency_id'));
  expect(sql).not.toContain('LIMIT 200');
  expect(sql).toContain('COALESCE(ua.is_active, 1) = 1');
  expect(params).toEqual([6, 6]);
});

it('shows one assigned Counseling service when a program placeholder exists alongside its provider',async()=>{
 services.push({...services[0],id:12,provider_user_id:0,first_name:null,last_name:null,organization_id:8,organization_name:'Counseling and Therapy'});
 const {clients,aggregates}=await listOfficeClients({agencyIds:[6]});
 expect(clients[0].services).toHaveLength(1);expect(clients[0].services[0]).toMatchObject({providerId:20,organizationName:'Counseling and Therapy',sourceServiceIds:[11,12]});expect(clients[0].nextStep).toEqual({key:'schedule',label:'Schedule first appointment'});expect(aggregates.unassigned).toBe(0);
});
it('retains both counselors on the office roster inside one counseling service',async()=>{
 services.push({...services[0],id:12,provider_user_id:21,first_name:'Second'});
 const {clients}=await listOfficeClients({agencyIds:[6]});
 expect(clients[0].services).toHaveLength(1);expect(clients[0].providers.map(provider=>provider.providerId).sort()).toEqual([20,21]);
});

it('retains a clinician with admin access when optional provider details fail to load',async()=>{
 const person={id:501,first_name:'Michael',last_name:'Mendez',agency_ids:'377'};
 pool.execute.mockImplementation(async sql=>{
  if(sql.includes('u.title, u.credential'))throw Object.assign(new Error('Optional field unavailable'),{code:'ER_BAD_FIELD_ERROR'});
  if(sql.includes('GROUP_CONCAT(DISTINCT ua.agency_id'))return [[person]];
  return [[]];
 });
 const people=await listHubProviders({agencyIds:[377]});expect(people).toMatchObject([{id:501,name:'Michael Mendez',agencyIds:[377]}]);
 const [fallback,params]=pool.execute.mock.calls.find(([sql])=>sql.includes('profile.user_id=u.id'));
 expect(fallback).toContain('availabilityByAgency');expect(fallback).toContain('u.has_provider_access');expect(params).toEqual([377]);
});
it('preserves agency-specific care decisions and every authorized agency in its fallback',async()=>{
 pool.execute.mockImplementation(async sql=>{if(sql.includes('u.title, u.credential'))throw Object.assign(new Error('Optional field unavailable'),{code:'ER_BAD_FIELD_ERROR'});return [[{id:20,first_name:'Care',last_name:'Provider',agency_ids:'2,6'}]];});
 const people=await listHubProviders({agencyIds:[2,6]});expect(people[0].agencyIds).toEqual([2,6]);
 const [sql,params]=pool.execute.mock.calls.find(([sql])=>sql.includes('profile.user_id=u.id'));
 expect(sql).toContain("IN ('false','0') THEN FALSE");expect(sql).toContain("IN ('true','1') THEN TRUE");expect(params).toEqual([2,6]);
});
it('reports a provider lookup failure instead of presenting an incomplete successful picker',async()=>{
 pool.execute.mockRejectedValue(Object.assign(new Error('Database unavailable'),{code:'ER_ACCESS_DENIED_ERROR'}));
 await expect(listHubProviders({agencyIds:[6]})).rejects.toThrow('Database unavailable');
});
