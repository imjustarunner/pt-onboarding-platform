import {updateMedicaidGroupRationale} from './medicaidGroupRationale.js';
import {codeInventory,restrictedCodeTable,CODE_USE_POLICY,HANDBOOK_APP_TRANSITION,RESTRICTED_CODES} from './handbookCodePresentation.js';
import {SUPERVISOR_COMPENSATION_HANDBOOK} from './roleCompensationTerms.js';

// Edit only the requested fragments; keep surrounding owner edits and training media.
export function correctHandbookPresentation(slug, body, rules=[]) {
 if(slug==='colorado-billing-compensation-appendix') {
  return body.replace(/<h2>Saved code inventory<\/h2><table>[\s\S]*?<\/table>(?:<h2>Restricted and currently unapproved services<\/h2>[\s\S]*?<\/table>)?/,codeInventory(rules));
 }
 if(slug==='service-code-approval-and-credit-reference') {
  const marker='<h2>Restricted and currently unapproved services</h2>';
  let main=body.split(marker)[0];
  // Remove these saved mapping rows from ordinary service tables, including 90853.
  main=main.replace(/<tr><th>([^<]+)<\/th>[\s\S]*?<\/tr>/g,(row,code)=>RESTRICTED_CODES.includes(code)?'':row);
  if(body.includes(marker))return main+body.slice(body.indexOf(marker)).replace(/<h2>Restricted and currently unapproved services<\/h2>[\s\S]*?<\/table>/,restrictedCodeTable());
  return main.replace('<h2>How quantities are categorized</h2>',restrictedCodeTable()+'<h2>How quantities are categorized</h2>');
 }
 if(slug==='groups-moratorium-and-approval')return updateMedicaidGroupRationale(body.includes(CODE_USE_POLICY)?body:CODE_USE_POLICY+body);
 if(slug==='timekeeping-support-and-overtime') {
  return body.replace(/(<!-- supervisor-compensation-october-2026 -->)<h3>Clinical supervision compensation<\/h3>[\s\S]*?<p>Your sick-leave payment rate[\s\S]*?<\/p>/,'$1'+SUPERVISOR_COMPENSATION_HANDBOOK);
 }
 if(slug===HANDBOOK_APP_TRANSITION.slug) {
  // Preserve attached instruction media when replacing this requested section.
  const media=(body.match(/<figure\b[^>]*>[\s\S]*?<\/figure>|<video\b[^>]*>[\s\S]*?<\/video>|<img\b[^>]*data-training-key=[^>]*>/gi)||[]).join('');
  return HANDBOOK_APP_TRANSITION.bodyHtml+media;
 }
 return body;
}
