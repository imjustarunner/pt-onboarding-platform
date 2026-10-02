import { describe, it, expect } from 'vitest';
import { assertPreviewActor, constrainPreviewInput, previewAgencySlug, previewRouteAllowed } from '../auricwellPreviewPolicy.js';
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
