/** Legacy provider shortcuts open their assigned-school panel, never a restricted admin workspace. */
export function providerSchoolPortalDestination({role,path,dashboardPath}){
 if(!['provider','intern','intern_plus','supervisor'].includes(String(role||'').toLowerCase()))return null;
 if(!/\/(?:admin\/school-portals(?:-hub)?|portals)\/?$/.test(String(path||'')))return null;
 return {path:dashboardPath,query:{tab:'schools_programs'},replace:true};
}
