const fail=(status,message)=>Object.assign(new Error(message),{status});

/** Only newly assigned disclosures carry this immutable server-side version binding. */
export function assertAssignedSmartDisclosureEvidence({link,binding,disclosureContext,intakeData,clientId,guardianUserId}) {
  let messages=link?.custom_messages||link?.customMessages||{};
  if(typeof messages==='string'){try{messages=JSON.parse(messages);}catch{messages={};}}
  if(!messages.disclosureContentHash)return intakeData;
  const expectedHash=messages.disclosureContentHash,locale=messages.disclosureLocale,payload=intakeData?.smartDisclosure;
  if(!binding||Number(binding.attachClientId)!==Number(clientId)||guardianUserId&&Number(guardianUserId)!==Number(binding.guardianUserId))throw fail(403,'This disclosure belongs to a different client or portal account.');
  if(!['en','es'].includes(locale)||String(link.language_code||'en')!==locale||disclosureContext?.locale!==locale||payload?.locale!==locale)throw fail(409,'The assigned disclosure language changed. Reopen the document from your portal.');
  if(disclosureContext?.contentHash!==expectedHash||payload?.contentHash!==expectedHash)throw fail(409,'The disclosure or care team changed. Ask your care team to attach the current version.');
  if(![true,1].includes(payload.acknowledged)||!payload.signatureData&&!String(payload.signerName||payload.signer?.name||'').trim()||!disclosureContext.providers?.length)throw fail(400,'Acknowledge and sign the current disclosure before submitting it.');
  return {...intakeData,smartDisclosure:{...payload,locale,contentHash:expectedHash,providers:disclosureContext.providers||[]}};
}
