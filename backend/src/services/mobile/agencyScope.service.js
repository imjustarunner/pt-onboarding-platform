import User from '../../models/User.model.js';
import pool from '../../config/database.js';
import {readAgencyAccess} from '../agencyAccessProfiles.service.js';
import {mobileQaScope} from './qaScope.service.js';

// Enumerate explicit memberships and existing platform/legacy grants, without the
// membership cache. Recheck effective access for every request; never create grants.
export async function listMobileAgencies(user,{db=pool}={}) {
 const [memberships]=await db.execute(`SELECT DISTINCT a.* FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id
  WHERE ua.user_id=? AND COALESCE(ua.is_active,1)=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 ORDER BY a.name`,[user.id]);
 const candidates=db===pool?await User._withPlatformAccess(user.id,memberships,false):memberships;
 const scoped=mobileQaScope(user,candidates);
 const agencies=[];
 for(const agency of scoped.agencies){
  if(db===pool && !await readAgencyAccess(user.id,Number(agency.id)))continue;
  agencies.push(agency);
 }
 return {...scoped,agencies};
}
