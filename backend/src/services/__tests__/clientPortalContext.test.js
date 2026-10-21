import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/OrganizationAffiliation.model.js', () => ({ default: { getActiveAgencyIdForOrganization: vi.fn() } }));
vi.mock('../../models/AgencySchool.model.js', () => ({ default: { getActiveAgencyIdForSchool: vi.fn() } }));
vi.mock('../emailSenderIdentityResolver.service.js', () => ({ resolvePreferredSenderIdentityForAgency: vi.fn() }));
vi.mock('../contactReminderToken.service.js', () => ({ publicAppBaseUrl: () => 'https://app.example.com' }));
import Agency from '../../models/Agency.model.js';
import Affiliation from '../../models/OrganizationAffiliation.model.js';
import { resolvePreferredSenderIdentityForAgency } from '../emailSenderIdentityResolver.service.js';
import { resolveClientPortalContext, resolveClientPortalSender, clientPortalInviteUrl, intakeClientPortal } from '../clientPortalContext.service.js';
const tenant = { id: 1, name: 'ITSCO', slug: 'itsco', organization_type: 'agency' };
const school = { id: 2, name: 'School', slug: 'school', organization_type: 'school' };
const learning = { id: 3, name: 'Tutoring', slug: 'tutoring', organization_type: 'learning' };
beforeEach(() => { vi.resetAllMocks(); Agency.findById.mockImplementation(async id => ({ 1: tenant, 2: school, 3: learning })[id]); });
it('uses the owning tenant portal for school-based care', async () => {
  expect(await resolveClientPortalContext({ agency_id: 1, organization_id: 2 })).toEqual({ tenant, portal: tenant, learning: false, clinical: false });
});
it('resolves legacy child-owned records to their main tenant', async () => {
  Affiliation.getActiveAgencyIdForOrganization.mockResolvedValue(1);
  expect(await resolveClientPortalContext({ agency_id: 2, organization_id: 2 })).toEqual({ tenant, portal: tenant, learning: false, clinical: false });
});
it('retains a separate learning portal under the owning tenant', async () => {
  const context = await resolveClientPortalContext({ agency_id: 1, organization_id: 3 });
  expect(context).toMatchObject({ tenant, portal: { id: 3, parent_portal_url: 'itsco' }, learning: true });
  const url = new URL(clientPortalInviteUrl({ portal: context.portal, token: 'setup-token', existingAccount: false }));
  expect(url.origin).toBe('https://app.itsco.health'); expect(url.pathname).toBe('/tutoring/new_account/setup-token'); expect(url.searchParams.get('portal')).toBe('tutoring');
});
it('creates a direct setup link on dedicated tenant hosts and a dashboard return for existing accounts', () => {
  const setup = new URL(clientPortalInviteUrl({ portal: tenant, token: 'token', existingAccount: false }));
  expect(setup.pathname).toBe('/new_account/token'); expect(setup.searchParams.get('portal')).toBe('itsco');
  const login = new URL(clientPortalInviteUrl({ portal: tenant, existingAccount: true }));
  expect(login.pathname).toBe('/login'); expect(login.searchParams.get('redirect')).toBe('/itsco/guardian?portal=itsco');
});
it('uses only a sender belonging to the main tenant', async () => {
  resolvePreferredSenderIdentityForAgency.mockResolvedValue({ id: 8, agency_id: 1, is_active: 1 });
  expect(await resolveClientPortalSender(1)).toMatchObject({ id: 8 });
  expect(resolvePreferredSenderIdentityForAgency).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 1, includePlatformDefaults: false, templateType: 'hub_portal_invite' }));
  for (const identity of [null, { id: 8, agency_id: null }, { id: 8, agency_id: 2 }, { id: 8, agency_id: 1, is_active: false }]) {
    resolvePreferredSenderIdentityForAgency.mockResolvedValue(identity);
    await expect(resolveClientPortalSender(1)).rejects.toMatchObject({ status: 503 });
  }
});
it('fails instead of sending from an unconfigured school', async () => {
  await expect(resolveClientPortalContext({ agency_id: 2, organization_id: 2 })).rejects.toMatchObject({ status: 503 });
});

it('routes clinical clients from every agency to AuricWell and leaves tutoring with its agency',async()=>{
 const clinical=await resolveClientPortalContext({agency_id:1,organization_id:1,client_type:'clinical'});
 const schoolContext=await resolveClientPortalContext({agency_id:1,organization_id:2,client_type:'school'});
 const counselingAtLearningOrg=await resolveClientPortalContext({agency_id:1,organization_id:3,client_type:'clinical'});
 for(const context of [clinical,schoolContext,counselingAtLearningOrg]) expect(clientPortalInviteUrl({portal:context.portal,token:'opaque',existingAccount:false})).toBe('https://auricwell.com/itsco/new_account/opaque?portal=itsco');
 const learningContext=await resolveClientPortalContext({agency_id:1,organization_id:1,client_type:'learning'});
 expect(learningContext.learning).toBe(true);expect(learningContext.clinical).toBe(false);
});

it('uses the counseling or tutoring enrollment context before a session exists',()=>{
 const mixed={...tenant,name:'Mixed care and learning',feature_flags:{medicalBillingEnabled:true}};
 expect(intakeClientPortal(mixed,{channel:'counseling'}).clinical_portal).toBe(true);
 expect(intakeClientPortal(mixed,{channel:'tutoring'}).clinical_portal).toBe(false);
 expect(intakeClientPortal(mixed,{channel:'tutoring',clients:[{client_type:'clinical'}]}).clinical_portal).toBe(true);
 expect(intakeClientPortal(mixed,{channel:'office',clients:[{client_type:'learning'}]}).clinical_portal).toBe(false);
});
