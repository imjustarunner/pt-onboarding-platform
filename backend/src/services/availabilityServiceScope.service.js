import {readProviderServices} from './providerServiceOfferings.service.js';
import {availabilityServiceType} from '../utils/availabilityService.js';
export async function prepareAvailabilityServices(providerId,agencyId,rows,database) {
 const offered=await readProviderServices(providerId,agencyId,database);
 const types=offered.services.filter(s=>s.offered).map(s=>s.serviceType);
 return rows.map(row=>{
  let serviceType=availabilityServiceType(row.serviceType??row.service_type);
  if(!serviceType){
   if(types.length===1)serviceType=types[0];
   else if(types.length>1&&!row.id)throw Object.assign(new Error('Choose which service each opening is for.'),{status:400});
  }
  if(serviceType&&!types.includes(serviceType))throw Object.assign(new Error('This employee is not assigned to offer that service in this organization.'),{status:403});
  return {...row,serviceType,careTypes:serviceType==='tutoring'?null:row.careTypes};
 });
}
