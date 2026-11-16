export function groupBillingPayers(organizations,{enrollmentLabel=value=>value,eftLabel=value=>value.status}={}) {
  return organizations.flatMap(organization=>{
    const payers=new Map();
    const get=(payerId,payerName)=>{
      if(!payers.has(payerId))payers.set(payerId,{key:`${organization.id}:${payerId}`,organization,payerId,payerName:payerName || 'Payer name needs review',offices:new Set(),npis:new Set(),states:{claims:[],era:[],eligibility:[],eft:[]},coverage:{claims:new Set(),era:new Set(),eligibility:new Set(),eft:new Set()}});
      const row=payers.get(payerId);if(payerName)row.payerName=payerName;return row;
    };
    for(const payer of organization.payers || [])get(payer.payerId,payer.payerName);
    for(const item of organization.enrollments || []){
      const row=get(item.payerId,item.payerName),field={'1500':'claims',era:'era',elig:'eligibility'}[item.type];
      if(field){row.states[field].push(enrollmentLabel(item.status));if(item.providerNpi)row.coverage[field].add(item.providerNpi);}
      if(item.providerNpi)row.npis.add(item.providerNpi);
      const office=(organization.billingOffices || []).find(office=>Number(office.id)===Number(item.officeId));
      const label=item.officeName || office?.name || office?.street_address;if(label)row.offices.add(label);
    }
    for(const item of organization.eft || []){
      const row=get(item.payerId,item.payerName);row.states.eft.push(eftLabel(item));if(item.providerNpi){row.npis.add(item.providerNpi);row.coverage.eft.add(item.providerNpi);}
    }
    return [...payers.values()].map(row=>{
      for(const field of Object.keys(row.states))if(row.states[field].length && row.coverage[field].size<row.npis.size)row.states[field].push('Not configured');
      const summarize=values=>{const distinct=[...new Set(values)];return distinct.length===0?'Not configured':distinct.length===1?distinct[0]:'Varies by billing NPI — manage to review';};
      return {...row,officeNames:[...row.offices],npiCount:row.npis.size,claims:summarize(row.states.claims),era:summarize(row.states.era),eligibility:summarize(row.states.eligibility),eft:summarize(row.states.eft)};
    }).sort((a,b)=>a.payerName.localeCompare(b.payerName));
  });
}
