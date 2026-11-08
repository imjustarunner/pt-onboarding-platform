// Browser-only fictional booking catalog. No booking or room request is created.
export const demoBookingOffices = [
  {id:990701,name:'Meadowbrook · Denver office',agencyIds:[990101],timezone:'America/Denver',isActive:true,address:'100 Example Way · Fictional Denver office'},
  {id:990702,name:'Meadowbrook · Lakewood office',agencyIds:[990101],timezone:'America/Denver',isActive:true,address:'200 Sample Lane · Fictional Lakewood office'}
];
export const demoBookingServices = [
  {code:'90837',label:'Individual psychotherapy · 60 minutes',defaultDurationMinutes:60,minDurationMinutes:53},
  {code:'90791',label:'Clinical intake',defaultDurationMinutes:60},
  {code:'90834',label:'Individual psychotherapy · 45 minutes',defaultDurationMinutes:45,minDurationMinutes:38},
  {code:'90832',label:'Individual psychotherapy · 30 minutes',defaultDurationMinutes:30,minDurationMinutes:16},
  {code:'90847',label:'Couples / family psychotherapy',defaultDurationMinutes:60,minDurationMinutes:26}
].map((service,index)=>({...service,tenantServiceId:990720+index,sessionMode:'individual',allowedPlaceOfService:['10','11'],medical:true}));
const roomsFor = id => [
  {id:id===990701?990711:990713,locationId:id,roomNumber:'204',name:'Counseling room',state:'open',requestable:true},
  {id:id===990701?990712:990714,locationId:id,roomNumber:'205',name:'Family room',state:'open',requestable:true}
];
export const demoServiceLocations = [
  {id:990151,name:'Telehealth',placeOfService:'10'},
  ...demoBookingOffices.map((office,index)=>({id:990152+index,name:office.name,placeOfService:'11',locationKind:'office_pos',billingOfficeLocationId:office.id}))
];
function office(id){const found=demoBookingOffices.find(row=>row.id===Number(id));if(!found)throw new Error('That office is outside this fictional demo.');return found;}
export function demoBookingResponse(path,params){
  if(path==='/offices')return demoBookingOffices.map(row=>({...row,agencyIds:[...row.agencyIds]}));
  if(path==='/office-schedule/booking-metadata')return {serviceCodes:demoBookingServices,serviceLocations:demoServiceLocations,appointmentTypes:[],appointmentSubtypes:[]};
  const detail=path.match(/^\/offices\/(\d+)$/);if(detail)return office(detail[1]);
  const catalog=path.match(/^\/office-schedule\/locations\/(\d+)\/(rooms|providers|weekly-grid)$/);
  if(catalog){const found=office(catalog[1]);if(catalog[2]==='rooms')return roomsFor(found.id);if(catalog[2]==='providers')return [];return {location:found,rooms:roomsFor(found.id),slots:[],assignments:[],events:[],pendingRequests:[]};}
  if(['/office-schedule/available-rooms-for-slot','/office-schedule/admin/available-rooms-for-slot'].includes(path)){
    const found=office(params.locationId);
    return {rooms:roomsFor(found.id),checkedOccurrences:params.recurrence==='ONCE'?1:Number(params.occurrenceCount||7),exampleOnly:true};
  }
  if(['/tenant-booking/agencies/990101/booking-options','/tenant-booking/agencies/990101/services'].includes(path))return {services:demoBookingServices.map(service=>({id:service.tenantServiceId,name:service.label,serviceCode:service.code,defaultDurationMinutes:service.defaultDurationMinutes,businessType:'mental_health',isActive:true,isStaffBookable:true,modality:'EITHER'}))};
  return undefined;
}
