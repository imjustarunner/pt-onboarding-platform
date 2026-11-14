import pool from '../config/database.js';
const staffRoles=new Set(['admin','support','staff','clinical_practice_assistant','provider','provider_plus','supervisor','intern','intern_plus']);
// This is a session transfer, not a membership/role grant.
// Membership is read uncached at mint and consume. Full-agency staff can
// leave the school-only origin for their existing agency on the central app.
export async function requireAgencyWorkspaceHandoff({user,agencyId,targetHost}, {getAgencies=async id=>{const [rows]=await pool.execute('SELECT a.* FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id WHERE ua.user_id=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 LIMIT 1',[id,agencyId]);return rows;}}={}) {
 if(!staffRoles.has(String(user?.role||'').toLowerCase()) || ['PROSPECTIVE','PENDING_SETUP'].includes(user?.status) || targetHost!=='app.itsco.health')throw Object.assign(new Error('This account cannot transfer to that workspace.'),{status:403});
 const agencies=await getAgencies(user.id);
 const agency=agencies.find(a=>Number(a.id)===Number(agencyId)&&String(a.organization_type||a.organizationType||'').toLowerCase()==='agency'&&![false,0,'0'].includes(a.is_active)&&![true,1,'1'].includes(a.is_archived));
 if(!agency)throw Object.assign(new Error('Sign in to an agency you already belong to.'),{status:403});
 return agency;
}
