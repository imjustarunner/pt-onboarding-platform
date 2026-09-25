const field=(key,label,type='text',extra={})=>({key,label,type,...extra});
const name=()=>field('name','Name'),amount=()=>field('amount','Amount ($)','number',{step:'0.01',min:'0.01'}),select=(key,label,source)=>field(key,label,'select',{source}),dates=()=>[field('startDate','Start date','date'),field('endDate','End date','date')],description=()=>field('description','Description','textarea',{optional:true});
export const forms={
 programs:[name(),description(),{...select('staffUserId','Responsible staff (optional)','staff'),optional:true}],
 partners:[name(),select('kind','Type',['grantor','vendor','donor','partner','staff','recipient']),field('contact','Contact','text',{optional:true}),field('notes','Notes','textarea',{optional:true})],
 funds:[name(),select('kind','Fund type',['restricted','unrestricted','reserve']),field('restrictions','Purpose and restrictions','textarea')],
 receipts:[select('fundId','Fund','funds'),amount(),field('receivedDate','Date received','date'),field('reference','Receipt / deposit reference')],
 grants:[name(),select('fundId','Fund','funds'),select('partnerId','Grantor','partners'),amount(),...dates(),field('reportDue','Report due','date',{optional:true}),field('restrictions','Grant restrictions','textarea')],
 budgets:[name(),select('programId','Program','programs'),select('fundId','Fund','funds'),select('grantId','Grant (if applicable)','grants'),amount(),...dates()],
 allocations:[name(),select('budgetId','Budget','budgets'),amount()],
 events:[name(),select('programId','Program','programs'),select('kind','Activity type',['event','training','mentoring','trip','scholarship']),...dates(),field('location','Location'),field('plannedParticipants','Planned participants','number',{min:0}),description()],
 expenses:[field('title','Expense description'),select('programId','Program','programs'),select('eventId','Event / trip (optional)','events'),select('kind','Expense type',['vendor','reimbursement','scholarship']),field('category','Category'),amount(),field('expenseDate','Expense date','date'),{...select('staffUserId','Staff member (optional)','staff'),optional:true},select('partnerId','Vendor / partner (optional)','partners'),description()],
 requests:[name(),select('kind','Request type',['support','budget_change','report']),select('programId','Program (optional)','programs'),select('grantId','Grant (optional)','grants'),field('dueDate','Due date','date',{optional:true}),description()]
};
export function dollarCents(value){const s=String(value);if(!/^\d{1,9}(\.\d{1,2})?$/.test(s))throw new Error('Enter dollars with at most two decimal places.');const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(n<1)throw new Error('Amount must be positive.');return n;}
export const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(cents||0)/100);
export const day=value=>value?String(value).slice(0,10):'—';
export const label=value=>String(value||'').replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());
