import {expect,it,vi} from 'vitest';
vi.mock('../../models/User.model.js',()=>({default:{}}));
import {requireAgencyWorkspaceHandoff} from '../workspaceHandoffAccess.service.js';
const agency={id:450,organization_type:'agency'},school={id:451,organization_type:'school'};
const getAgencies=vi.fn(async()=>[agency,school]);
it('transfers an existing provider agency session but grants no additional membership',async()=>{
 await expect(requireAgencyWorkspaceHandoff({user:{id:1438,role:'provider'},agencyId:450,targetHost:'app.itsco.health'},{getAgencies})).resolves.toEqual(agency);
 for(const agencyId of [6,451])await expect(requireAgencyWorkspaceHandoff({user:{id:1438,role:'provider'},agencyId,targetHost:'app.itsco.health'},{getAgencies})).rejects.toMatchObject({status:403});
});
it.each(['client','client_guardian','school_staff','prospective'])('denies %s a full-agency session handoff',async role=>{
 await expect(requireAgencyWorkspaceHandoff({user:{id:2,role},agencyId:450,targetHost:'app.itsco.health'},{getAgencies})).rejects.toMatchObject({status:403});
});
it('denies untrusted hosts, pending employment and revoked membership when consumed',async()=>{
 for(const input of [{targetHost:'outside.test'},{user:{id:1438,role:'provider',status:'PROSPECTIVE'}}])await expect(requireAgencyWorkspaceHandoff({user:{id:1438,role:'provider'},agencyId:450,targetHost:'app.itsco.health',...input},{getAgencies})).rejects.toMatchObject({status:403});
 await expect(requireAgencyWorkspaceHandoff({user:{id:1438,role:'provider'},agencyId:450,targetHost:'app.itsco.health'},{getAgencies:async()=>[]})).rejects.toMatchObject({status:403});
});

it('rejects an inactive or archived agency membership at transfer time',async()=>{for(const stale of [{is_active:0},{is_archived:1}])await expect(requireAgencyWorkspaceHandoff({user:{id:1438,role:'provider'},agencyId:450,targetHost:'app.itsco.health'},{getAgencies:async()=>[{...agency,...stale}]})).rejects.toMatchObject({status:403});});
