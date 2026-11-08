import {publicUploadsUrlFromStoredPath} from '../../utils/uploads.js';
export function mobileAgencyIcon(agency={}){
 const key=String(agency.portal_url || agency.slug || agency.agency_slug || '').toLowerCase().replace(/[^a-z0-9]/g,'');
 const name=String(agency.name || agency.agency_name || '').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(['itsco','itscollc'].includes(key)||['itsco','itscollc'].includes(name))return 'https://auricwell.com/email-signatures/staff-html/itsco-main-logo.png';
 if(['nlu','nextlevelup','nextleveluplcc','nextlevelupllc'].includes(key)||name.startsWith('nextlevelup'))return 'https://auricwell.com/email-signatures/staff-html/nlu-plus-one-mark.png';
 if(['tisi','innerstrength','theinnerstrengthinstitute'].includes(key)||name==='theinnerstrengthinstitute')return 'https://auricwell.com/assets/branding/innerstrength-icon.png';
 return publicUploadsUrlFromStoredPath(agency.icon_path || agency.logo_path || agency.logo_url || agency.agency_logo_url || agency.agency_logo_path) || null;
}
