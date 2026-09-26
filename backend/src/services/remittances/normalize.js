import crypto from 'node:crypto';
export const list = value => Array.isArray(value) ? value : value ? [value] : [];
export const fail = (status,message) => Object.assign(new Error(message),{status});
export function money(value) {
 const s=String(value ?? '').trim();
 if(!/^-?\d{1,10}(\.\d{1,2})?$/.test(s))throw fail(409,'Remittance contains an invalid or missing monetary amount');
 const negative=s.startsWith('-'),[whole,fraction='']=s.replace(/^-/,'').split('.');
 return (Number(whole)*100+Number(fraction.padEnd(2,'0')))*(negative?-1:1);
}
export function serviceDate(value) {
 const s=String(value||'').replace(/-/g,'');
 if(!/^\d{8}$/.test(s))return null;
 const date=`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}`;
 return Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date?date:null;
}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const hash=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const adjustments=value=>list(value).map(a=>({group:String(a.group||''),code:String(a.code||''),amountCents:money(a.amount)}));
export function normalizeItem(raw,index) {
 const blockers=[];let paidCents=0,billedCents=0,rows=[],claimAdjustments=[];
 try {
  paidCents=money(raw.total_paid);billedCents=money(raw.total_charge);
  claimAdjustments=adjustments(raw.adjustment);
  rows=list(raw.charge).map(l=>({code:String(l.proc_code||''),date:serviceDate(l.from_dos||raw.from_dos),throughDate:serviceDate(l.thru_dos||l.from_dos||raw.from_dos),units:String(l.units||''),modifiers:[l.mod1,l.mod2,l.mod3,l.mod4].map(x=>String(x||'')),billedCents:money(l.charge),paidCents:money(l.paid),adjustments:adjustments(l.adjustment)}));
 }catch(e){blockers.push(e.message);}
 const all=[...claimAdjustments,...rows.flatMap(l=>l.adjustments)];
 if(!rows.length)blockers.push('Service-line detail is required before posting');
 if(rows.some(l=>!l.code||!l.date||!l.throughDate||!/^\d+(\.\d+)?$/.test(l.units)))blockers.push('Service identity is incomplete');
 if(all.some(a=>!['CO','PR','OA','PI'].includes(a.group)||!a.code))blockers.push('Adjustment group or reason requires review');
 const adjustmentCents=all.reduce((n,a)=>n+a.amountCents,0),responsibilityCents=all.filter(a=>a.group==='PR').reduce((n,a)=>n+a.amountCents,0);
 if(billedCents!==paidCents+adjustmentCents||rows.reduce((n,l)=>n+l.billedCents,0)!==billedCents||rows.reduce((n,l)=>n+l.paidCents,0)!==paidCents)blockers.push('Claim charges, payments and adjustments do not balance');
 if(!claimAdjustments.length&&rows.some(l=>l.billedCents!==l.paidCents+l.adjustments.reduce((n,a)=>n+a.amountCents,0)))blockers.push('Service-line payment and adjustments do not balance');
 const status=String(raw.status_code||'');
 if(!['1','2','3','4','19','20','21','22'].includes(status))blockers.push('Unsupported adjudication status requires manual review');
 if(status!=='22'&&(paidCents<0||billedCents<0||all.some(a=>a.amountCents<0)))blockers.push('Negative adjustments require reversal reconciliation');
 const forward=!!(raw.crossover_id||raw.crossover_carrier)||['19','20','21'].includes(status);
 return {index,memberId:String(raw.ins_number||''),pcn:String(raw.pcn||''),payerControlNumber:String(raw.payer_icn||''),patientName:[raw.pat_name_f,raw.pat_name_l].filter(Boolean).join(' '),status,forwarded:forward,denied:status==='4',reversal:status==='22',billedCents,paidCents,adjustmentCents,responsibilityCents,lines:rows,claimAdjustments,blockers};
}
export function normalizeEra(raw,{taxId,npis,eraId}) {
 if(String(raw.eraid)!==String(eraId)||String(raw.prov_taxid||'').replace(/\D/g,'')!==taxId||!npis.includes(String(raw.prov_npi)))throw fail(409,'Remittance billing identity does not match this agency');
 if(!String(raw.payerid||''))throw fail(409,'Remittance payer identity is missing');
 const paidCents=money(raw.paid_amount),items=list(raw.claim).map(normalizeItem);
 const differenceCents=paidCents-items.reduce((n,i)=>n+i.paidCents,0);
 return {eraId:String(eraId),payerId:String(raw.payerid),payerName:String(raw.payer_name||''),billingNpi:String(raw.prov_npi),paidDate:serviceDate(raw.paid_date),trace:String(raw.check_number||''),paidCents,differenceCents,items,requiresReview:!items.length||differenceCents!==0||!serviceDate(raw.paid_date)||!!raw.provider_adjustment||!!raw.plb};
}
// Match the immutable submitted service snapshot, never patient name alone.
export function matchesSubmission(item,era,sent,{allowPcnOverride=false}={}) {
 if(!sent||(!allowPcnOverride&&String(sent.pcn)!==item.pcn)||String(sent.bill_npi)!==era.billingNpi||String(sent.payerid)!==era.payerId)return false;
 if(!item.memberId||String(sent.ins_number||'')!==item.memberId)return false;
 const sign=item.reversal?-1:1;
 try {
  if(money(sent.total_charge)!==sign*item.billedCents)return false;
  const signature=l=>JSON.stringify([l.code,l.date,l.throughDate,Number(l.units),l.modifiers,l.billedCents]);
  const expected=list(sent.charge).map(l=>signature({code:String(l.proc_code),date:serviceDate(l.from_date),throughDate:serviceDate(l.thru_date||l.from_date),units:l.units,modifiers:[l.mod1,l.mod2,l.mod3,l.mod4].map(v=>String(v||'')),billedCents:money(l.charge)})).sort();
  const actual=item.lines.map(l=>signature({...l,billedCents:sign*l.billedCents})).sort();
  return expected.length>0&&JSON.stringify(expected)===JSON.stringify(actual);
 } catch {return false;}
}
