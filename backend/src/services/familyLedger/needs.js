import {listBalances} from './views.js';
import {listSplitRequests} from './sharing.js';
import {listPaymentTasks} from './tasks.js';
import {listCardTasks} from '../insuranceCards/service.js';
import {requireBillingLink} from '../familyBillingPolicy.service.js';

export function summarizeBillingNeeds({balances=[],splits=[],tasks=[],cards=[]},clientId=null) {
  const selected=id=>!clientId||Number(id)===Number(clientId);
  const mine=balances.filter(b=>b.isOwnShare&&selected(b.clientId));
  return {
    dueCents:mine.filter(b=>b.billingState==='due'&&!b.paymentStatus).reduce((sum,b)=>sum+Number(b.dueCents||0),0),
    pendingPayments:mine.filter(b=>b.paymentStatus).length,
    splitRequests:splits.filter(s=>s.needsMyAcceptance&&selected(s.clientId)).length,
    paymentTasks:tasks.filter(t=>t.status==='pending'&&(!t.expiresAt||new Date(t.expiresAt)>new Date())&&t.clientIds.some(selected)).map(({id,title})=>({id,title})),
    insuranceCards:cards.filter(c=>['missing','help'].includes(c.state)&&c.clients.some(x=>selected(x.id))).map(({profileId,state,missingSlots})=>({profileId,state,missingSlots}))
  };
}
export async function guardianBillingNeeds(context) {
  const [balances,splits,tasks,cards]=await Promise.all([listBalances(context),listSplitRequests(context),listPaymentTasks(context),listCardTasks(context)]);
  const authorized=[];
  for(const task of tasks){
    try{for(const clientId of task.clientIds)await requireBillingLink(context.userId,clientId,context.agencyId);authorized.push(task);}catch(e){if(e.status!==403)throw e;}
  }
  return summarizeBillingNeeds({balances,splits,tasks:authorized,cards},context.clientId);
}
