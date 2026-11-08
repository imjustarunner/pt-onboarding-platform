// Memory only: locking or changing accounts removes the family credential.
let context=null;
export const familyDeviceContext=()=>context;
export function activateFamilyDevice(value){context=value;}
export function clearFamilyDevice(){context=null;}
