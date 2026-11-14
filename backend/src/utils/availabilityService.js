export function availabilityServiceType(value) {
 if(value==null||value==='')return null;
 const type=String(value).trim().toLowerCase();
 if(!['tutoring','counseling','coaching','consulting','evaluation'].includes(type))throw Object.assign(new Error('Choose the service for this opening. Childcare is scheduled as a childcare shift.'),{status:400});
 return type;
}
export function availabilityMatchesService(rowType,requestedType,legacyType='counseling') {
 return !requestedType || (availabilityServiceType(rowType)||legacyType)===requestedType;
}
