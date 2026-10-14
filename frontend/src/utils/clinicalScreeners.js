export const suicideScreener={
 key:'cssrs-screener',title:'C-SSRS · Suicide ideation screener',
 description:'Conduct the Columbia suicide screener and save a protected clinical record, with or without a linked client.',
 keywords:'suicide suicidal ideation suicide risk screening screener assessment columbia cssrs c-ssrs c ssrs safety'
};
export function matchesSuicideScreener(query=''){
 const haystack=`${suicideScreener.title} ${suicideScreener.description} ${suicideScreener.keywords}`.toLowerCase();
 return String(query).trim().toLowerCase().split(/\s+/).every(word=>haystack.includes(word));
}
export function screenerLocation(prefix='',clientId=null){return {path:`${prefix}/clinical-forms`,query:{form:suicideScreener.key,...(clientId?{clientId:String(clientId)}:{})}};}
