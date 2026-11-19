import { describe, expect, it } from 'vitest';
import { clientProfileActions } from '../clientProfileActions.js';
describe('contextual client profile actions', () => {
  it('makes Assignments the primary overview shortcut for support', () => {
    const actions = clientProfileActions({canEdit:true,canPortal:true});
    expect(actions[0]).toMatchObject({id:'assignments',target:'assignments'});
    expect(actions.map(action=>action.id)).toEqual(['assignments','edit','communications','portal']);
  });
  it('uses portal sharing and access actions without clinical shortcuts for support', () => {
    const actions = clientProfileActions({hub:'portal',canPortal:true,canInvite:true,canDocuments:true});
    expect(actions.map(action=>action.label)).toEqual(['Portal access','Invite to portal','Documents & assessments']);
    expect(actions[0].target).toBe('guardians');
  });
  it('does not offer assignment editing, invitations, or billing without access', () => {
    for(const hub of ['overview','account','portal','records']) {
      const actions = clientProfileActions({hub});
      expect(actions.some(action=>['assignments','edit','invite','updates','billing','assessments'].includes(action.id))).toBe(false);
    }
  });
  it('changes actions with the current subpage and avoids its own destination', () => {
    expect(clientProfileActions({hub:'account',sub:'guardians',canEdit:true,canPortal:true,canInvite:true}).map(action=>action.id)).toEqual(['invite','portal','communications']);
    const actions=clientProfileActions({hub:'records',sub:'billing',canBilling:true,canClinical:true});
    expect(actions.some(action=>action.id==='billing')).toBe(false);
    expect(actions.some(action=>action.id==='notes')).toBe(true);
  });
});
it('omits unavailable documents and update requests for restricted staff',()=>{
 for(const hub of ['overview','portal','account','records']){
  const actions=clientProfileActions({hub,canEdit:true,canPortal:true,canDocuments:false,canRequestUpdates:false});
  expect(actions.some(action=>['documents','updates'].includes(action.id))).toBe(false);
 }
});
it('retains secure composition, upload and paper processing in the shared overview actions',()=>{
 const actions=clientProfileActions({canEdit:true,canSecureMessage:true,canUpload:true,canProcessPaper:true});
 expect(actions.map(action=>action.id)).toEqual(['assignments','edit','secure-message','upload','process-paper']);
 expect(clientProfileActions({hub:'portal',canDocuments:true,canPortalDocuments:false}).some(action=>action.id==='documents')).toBe(false);
});
