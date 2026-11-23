import Client from '../models/Client.model.js';
import Contact from '../models/ClientContactAffiliation.model.js';
import {readChartRecord,saveChartRecord} from './clientChartImport.service.js';
import {prepareGuardianAccount} from './guardianAccountPreparation.service.js';
import {seedImportedGuardianNotifications} from './importedGuardianNotifications.service.js';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});

// Use the saved, chart-bound contact. This action neither reimports the source
// paste nor grants access or sends an invitation to another parent.
export async function prepareImportedGuardianAccount(scope,affiliationId,actorUserId){
 if(!Number.isSafeInteger(affiliationId)||affiliationId<1)throw fail('Choose a saved parent or guardian contact.');
 const source=await readChartRecord(scope,'contacts');
 const saved=source.value?.[affiliationId];
 const current=await Contact.findById(affiliationId);
 if(!saved||!current||Number(current.client_id)!==scope.clientId||Number(current.agency_id)!==scope.agencyId||Number(current.is_active)!==1||Number(current.contact_is_active)!==1)throw fail('This imported contact is no longer available on this client.',404);
 const client=await Client.findById(scope.clientId);
 if(!client||Number(client.agency_id)!==scope.agencyId)throw fail('Client not found in this agency.',404);
 const fullName=String(current.contact_full_name||'').trim(),names=fullName.split(/\s+/);
 if(names.length<2)throw fail('Save the parent or guardian’s first and last name on their contact card.');
 const contact={...saved,fullName,email:current.contact_email||'',mobilePhone:current.contact_phone||'',relationshipType:current.relationship_type||saved.relationshipType};
 const portalAccount=await prepareGuardianAccount({client,profile:{fullName,firstName:names[0],lastName:names.slice(1).join(' '),email:contact.email,phone:contact.mobilePhone,relationship:contact.relationshipType},actorUserId});
 if(!portalAccount.prepared)throw fail(portalAccount.reason||'This contact’s account could not be prepared.');
 const notifications=await seedImportedGuardianNotifications({...scope,guardianUserId:portalAccount.userId,affiliationId,contact,actorUserId});
 const result={...contact,portalAccount,...(notifications?{notificationImport:notifications}:{})};
 await saveChartRecord(scope,'contacts',0,{[affiliationId]:result},actorUserId);
 return result;
}
