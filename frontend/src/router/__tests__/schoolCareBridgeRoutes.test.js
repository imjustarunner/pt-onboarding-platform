import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { schoolCareBridgeRoutes, addSchoolCareBridgeWorkflowAliases } from '../schoolCareBridgeRoutes';
import { publicDomainHistory, publicSitePaths } from '../../utils/publicDomainRouting';

describe('SchoolCareBridge shared workspaces', () => {
  it.each(['app.itsco.health', 'schoolcarebridge.org'])('resolves the logo destination and every partner tab on %s', host => {
    const router = createRouter({ history: publicDomainHistory(createMemoryHistory(), host), routes: schoolCareBridgeRoutes });
    for (const section of ['', '/schools', '/clients', '/providers', '/settings', '/agreement']) {
      const internal = `/schoolcarebridge/app/partners/itsco${section}`;
      const resolved = router.resolve(internal);
      expect(resolved.name).toBe('SchoolCareBridgePartner');
      expect(resolved.params.partnerSlug).toBe('itsco');
      expect(resolved.params.partnerSection).toBe(section.slice(1));
      const href = host === 'schoolcarebridge.org' ? `/app/partners/itsco${section}` : internal;
      expect(resolved.href).toBe(href);
      expect(publicSitePaths(host)?.internal(href) || href).toBe(internal);
    }
  });
  it('distinguishes shared operations and document signing from a school slug', () => {
    const router = createRouter({ history: createMemoryHistory(), routes: schoolCareBridgeRoutes });
    expect(router.resolve('/schoolcarebridge/app/operations').name).toBe('SchoolCareBridgeOperations');
    const signing = router.resolve('/schoolcarebridge/app/partners/itsco/tasks/documents/42/sign');
    expect(signing.name).toBe('SchoolCareBridgePartnerDocumentSigning');
    expect(signing.meta.requiresCapability).toBe('canSignDocuments');
    expect(router.resolve('/schoolcarebridge/app/keller').params.organizationSlug).toBe('keller');
  });
});

it.each(['schoolcarebridge.org','mh4kidz.org'])('opens canonical annual administration with the existing route guards on %s',host=>{
 const meta={requiresAuth:true,requiresRole:['admin','support','staff','super_admin','provider_plus','clinical_practice_assistant'],allowSubCoordinator:true,organizationSlug:true};
 const route={path:'/:organizationSlug/admin/schools/overview',name:'OrganizationSchoolOverviewDashboard',component:{template:'<div />'},meta};
 addSchoolCareBridgeWorkflowAliases([route]);
 const router=createRouter({history:publicDomainHistory(createMemoryHistory(),host),routes:[route]});
 const resolved=router.resolve('/schoolcarebridge/app/itsco/admin/schools/overview?orgType=school&yearUpdate=1');
 expect(resolved.name).toBe('OrganizationSchoolOverviewDashboard');expect(resolved.params.organizationSlug).toBe('itsco');
 expect(resolved.meta).toEqual(meta);expect(resolved.query.yearUpdate).toBe('1');
 expect(resolved.href).toBe(`${host==='schoolcarebridge.org'?'':'/schoolcarebridge'}/app/itsco/admin/schools/overview?orgType=school&yearUpdate=1`);
});
