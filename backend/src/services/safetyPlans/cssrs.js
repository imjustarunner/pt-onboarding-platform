import {buildCssrsScreenerFields} from '../../data/validatedClinicalScreens.en.js';
import {fail} from './template.js';
// Healthcare EHR use: Columbia Lighthouse Project explicitly permits embedding.
// Keep this Recent edition separate from previously saved intake snapshots.
const fields=buildCssrsScreenerFields().map((f,i)=>[f.key,`${i+1}) ${f.label}`,{type:'radio',options:f.options,showIf:f.showIf?.fieldKey?f.showIf:undefined,helperText:f.key==='cssrs_6'?'Lifetime':f.helperText}]);
fields.find(f=>f[0]==='cssrs_5')[1]='5) Have you started to work out or worked out the details of how to kill yourself? Did you intend to carry out this plan?';
fields.push(['cssrs_6_recent','Was this within the past three months?',{type:'radio',options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}],showIf:{fieldKey:'cssrs_6',equals:'yes'}}]);
export const cssrsTemplate={
 key:'cssrs-screener',version:'2026-10-14.1',title:'C-SSRS · Suicide ideation screener',
 description:'Columbia-Suicide Severity Rating Scale · Screen Version – Recent. Conduct with the individual. Questions 1–5 cover the past month; question 6 covers lifetime behavior, followed by the past three months when applicable. This screening supports clinical assessment; it does not establish safety or replace your agency’s crisis procedure.',
 sections:[{title:'Screening questions',notice:'Ask questions 1 and 2. If question 2 is Yes, ask 3–5; if No, skip to question 6. Ask question 6 in either case. Leave unanswered questions blank; do not infer No.',fields},
 {title:'Staff record and follow-up (not part of the C-SSRS instrument)',fields:[
 ['administeredBy','Administering staff / credentials',{type:'text'}],
 ['followUp','Clinical review, actions taken, disposition and follow-up plan',{type:'textarea'}],
 ['fitConfirmed','I confirmed the respondent, consent, version and suitability for this administration',{type:'select',options:[{value:'yes',label:'Confirmed'}]}],
 ['screenStatus','Record status',{type:'select',options:[{value:'draft',label:'Draft / incomplete'},{value:'completed',label:'Completed and reviewed'}]}],
 ],notice:'Follow your agency’s response protocol for any concern. Current intent, a plan with intent, or recent suicidal behavior requires prompt safety follow-up. Recording or saving answers does not notify an emergency service or care team.'}],
 references:[{title:'Columbia Lighthouse Project · Official Recent screener and triage reference',url:'https://cssrs.columbia.edu/wp-content/uploads/C-SSRS-Screener-with-triage-points-2026.pdf'},{title:'Columbia Lighthouse Project · Healthcare use and training',url:'https://cssrs.columbia.edu/the-columbia-scale-c-ssrs/cssrs-for-communities-and-healthcare/'}]
};
export function validateCssrsComplete(data){
 const required=['cssrs_1','cssrs_2','cssrs_6',...(data.cssrs_2==='yes'?['cssrs_3','cssrs_4','cssrs_5']:[]),...(data.cssrs_6==='yes'?['cssrs_6_recent']:[])];
 if(!data.personLabel||!data.planDate||required.some(k=>!['yes','no'].includes(data[k]))||!data.administeredBy?.trim()||!data.followUp?.trim()||data.fitConfirmed!=='yes')fail(400,'Complete the applicable screening questions, individual, date, staff, suitability confirmation and clinical follow-up before marking completed or signing. You can save an incomplete draft.');
}
