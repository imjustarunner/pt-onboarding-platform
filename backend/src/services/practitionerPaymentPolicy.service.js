import {billingError} from './familyBillingPolicy.service.js';
export function assertPractitionerPacketOpen(packet){if(!packet)throw billingError(404,'Packet not found');if(packet.token_expires_at&&new Date(packet.token_expires_at)<=new Date())throw billingError(410,'Packet link expired');}
export function assertPractitionerPayment(intent,{packet,packageId,paymentMode,amountCents}){
 if(intent?.status!=='succeeded'||Number(intent.amount_received)!==Number(amountCents)||Number(intent.amount)!==Number(amountCents)||intent.currency!=='usd'||String(intent.metadata?.packet_id)!==String(packet.id)||String(intent.metadata?.package_id)!==String(packageId)||String(intent.metadata?.agency_id)!==String(packet.agency_id)||String(intent.metadata?.client_id)!==String(packet.client_id)||intent.metadata?.payment_mode!==paymentMode||intent.metadata?.source!=='practitioner_packet')throw billingError(409,'The confirmed payment does not match this package purchase');
}
