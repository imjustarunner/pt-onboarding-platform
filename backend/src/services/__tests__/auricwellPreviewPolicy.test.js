import { describe, it, expect } from 'vitest';
import { assertPreviewActor, constrainPreviewInput, previewAgencySlug, previewRouteAllowed, assertQaPreviewPractice, qaPreviewRouteAllowed } from '../auricwellPreviewPolicy.js';
describe('AuricWell administrator preview', () => {
  it('requires the actual active superadmin, never a demo or impersonated session', () => {
    const user={id:9,role:'super_admin',is_active:1,status:'ACTIVE_EMPLOYEE'};
    expect(()=>assertPreviewActor(user)).not.toThrow();
    for(const role of ['admin','provider','client_guardian']) expect(()=>assertPreviewActor({...user,role})).toThrow();
    expect(()=>assertPreviewActor({...user,is_active:0})).toThrow();
    expect(()=>assertPreviewActor(user,{demoMode:true})).toThrow();
    expect(()=>assertPreviewActor(user,{testAccountSwitch:true})).toThrow();
  });
  it('only aliases the explicitly requested InnerStrength URL', () => {
    expect(previewAgencySlug('innerstrength')).toBe('tisi');
    expect(previewAgencySlug('example')).toBe('example');
    expect(()=>previewAgencySlug('../tisi')).toThrow();
  });
  it('rejects conflicting practice identifiers even inside nested payloads', () => {
    expect(()=>constrainPreviewInput({agencyId:'7',items:[{agency_id:7}]},7)).not.toThrow();
    for(const value of [{agencyId:8},{agencyIds:[7,8]},{items:[{agency_id:8}]},{organization_id:'all'}]) expect(()=>constrainPreviewInput(value,7)).toThrow();
  });
  it('holds unrelated workflows, signatures, transmissions, files, and destructive operations', () => {
    for(const [method,path] of [['GET','/payroll'],['GET','/users'],['GET','/uploads/private.pdf'],['POST','/clinical-notes/transcribe'],['POST','/clinical-data/sessions/7/notes'],['POST','/medical-billing/claimmd/claims/3/submit'],['DELETE','/clients/9'],['PUT','/clinical-notes/work-queue']]) expect(previewRouteAllowed(method,path),`${method} ${path}`).toBe(false);
    expect(previewRouteAllowed('GET','/clinical-notes/contact-documentation')).toBe(true);
    expect(previewRouteAllowed('POST','/clinical-notes/contact-documentation/email/8')).toBe(true);
    expect(previewRouteAllowed('DELETE','/clinical-notes/contact-documentation/email/8')).toBe(false);
    expect(previewRouteAllowed('GET','/medical-billing/workspace')).toBe(true);
    expect(previewRouteAllowed('POST','/clinical-notes/drafts')).toBe(true);
    expect(previewRouteAllowed('PATCH','/clinical-notes/drafts/8')).toBe(true);
  });
});
describe('isolated QA practice access',()=>{
  const provider={id:1433,role:'provider',email:'qa.provider.auricwell@example.com',is_demo:1,is_active:1,status:'ACTIVE_EMPLOYEE'};
  it('allows the two named QA providers only with independently verified membership and provider roles',()=>{
    for(const key of ['supervisor','supervisee']) {
      const user={...provider,email:`qa.provider.${key}.auricwell@example.com`};
      expect(()=>assertPreviewActor(user,{}, {qaAgencyId:450})).not.toThrow();
      expect(()=>assertPreviewActor(user)).toThrow();
      expect(()=>assertPreviewActor({...user,role:'admin'}, {}, {qaAgencyId:450})).toThrow();
      expect(()=>assertPreviewActor({...user,is_demo:0}, {}, {qaAgencyId:450})).toThrow();
    }
  });
  it('requires the exact synthetic identity and an independently verified membership',()=>{
    expect(()=>assertPreviewActor(provider,{}, {qaAgencyId:450})).not.toThrow();
    expect(()=>assertPreviewActor(provider)).toThrow();
    for(const user of [{...provider,is_demo:0},{...provider,email:'other@example.com'},{...provider,role:'admin'},{...provider,is_archived:1}])
      expect(()=>assertPreviewActor(user,{}, {qaAgencyId:450})).toThrow();
    expect(()=>assertPreviewActor(provider,{testAccountSwitch:true},{qaAgencyId:450})).toThrow();
  });
  it('rejects another agency even when its numeric identifier or slug alone matches',()=>{
    const req={auricwellQaAgencyId:450};
    expect(()=>assertQaPreviewPractice(req,{id:450,slug:'auricwell-qa-demo'})).not.toThrow();
    for(const agency of [null,{id:2,slug:'itsco'},{id:450,slug:'itsco'},{id:2,slug:'auricwell-qa-demo'}])
      expect(()=>assertQaPreviewPractice(req,agency)).toThrow();
  });
  it('denies global management, other user preferences and support writes',()=>{
    for(const [method,path] of [['GET','/users/10/preferences'],['GET','/agencies/2'],['POST','/platform/toast-announcements'],['GET','/auricwell-preview/toasts']])
      expect(qaPreviewRouteAllowed(method,path,provider,450)).toBe(false);
    expect(qaPreviewRouteAllowed('GET','/users/1433/preferences',provider,450)).toBe(true);
    expect(qaPreviewRouteAllowed('POST','/clinical-notes/drafts',{...provider,role:'support'},450)).toBe(false);
    expect(qaPreviewRouteAllowed('POST','/clinical-notes/drafts',provider,450)).toBe(true);
  });
});
