export function guardianServiceRestrictions(link) {
 let permissions;
 try{permissions=typeof link?.permissions_json==='string'?JSON.parse(link.permissions_json):(link?.permissions_json??{});}catch{return {kinds:[],agencyIds:[]};}
 if(!permissions||typeof permissions!=='object'||Array.isArray(permissions))return {kinds:[],agencyIds:[]};
 if(permissions.learningOnly!==true&&!Object.hasOwn(permissions,'serviceKinds'))return null;
 const kinds=Array.isArray(permissions.serviceKinds)?permissions.serviceKinds.filter(kind=>['tutoring','counseling','coaching','consultation'].includes(kind)):(permissions.learningOnly?['tutoring']:[]);
 const agencyIds=(Array.isArray(permissions.serviceAgencyIds)?permissions.serviceAgencyIds:[link.agency_id]).map(Number).filter(id=>Number.isSafeInteger(id)&&id>0);
 return {kinds:permissions.learningOnly?kinds.filter(kind=>kind==='tutoring'):kinds,agencyIds};
}
export function guardianServiceAllowed(link,service) {
 const restriction=guardianServiceRestrictions(link);
 return !restriction||(restriction.agencyIds.includes(Number(service.agency_id))&&restriction.kinds.includes(service.service_kind));
}
export function guardianLearningAccessOnly(link) {
 const restriction=guardianServiceRestrictions(link);
 return !!restriction&&!restriction.kinds.includes('counseling');
}
