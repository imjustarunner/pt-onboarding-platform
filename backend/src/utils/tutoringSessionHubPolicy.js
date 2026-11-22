export function tutoringSessionHubEnabled(agency) {
 let flags=agency?.feature_flags||{};
 if(typeof flags==='string'){try{flags=JSON.parse(flags);}catch{return false;}}
 return flags.tutoringSessionHubV2===true;
}
