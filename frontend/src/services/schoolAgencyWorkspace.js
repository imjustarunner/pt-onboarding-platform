import {isSchoolCareBridgeOnly} from '../utils/schoolCareBridgeTenant';
import {rememberChosenOrganization} from '../utils/workingOrganization';
import {leaveSchoolPortalShell} from '../utils/schoolPortalShell';

/** Explicit workspace exits reload on the existing session origin, outside school route aliases. */
export async function transferSchoolAgencySession({agencies=[],parentId,section='dashboard',role,userId}, {location=window.location}) {
 if(!['dashboard','admin-dashboard'].includes(section))throw Error('Choose an agency dashboard.');
 const parent=agencies.find(a=>Number(a.id)===Number(parentId)&&String(a.organization_type||a.organizationType).toLowerCase()==='agency');
 const superadmin=String(role).toLowerCase()==='super_admin';
 if((!parent&&!superadmin) || (parent && isSchoolCareBridgeOnly(parent)))throw Error('No full agency workspace is available to your account.');
 const slug=String(parent?.portal_url||parent?.slug||'');
 if(parent&&!/^[a-z0-9-]+$/.test(slug))throw Error('Your agency workspace address could not be verified.');
 if(parent && userId)rememberChosenOrganization(userId,parent.id);
 leaveSchoolPortalShell();
 const path=slug?`/${slug}/${section}`:`/${section}`;
 location.assign(new URL(path,location.origin || `https://${location.hostname}`).href);
}
