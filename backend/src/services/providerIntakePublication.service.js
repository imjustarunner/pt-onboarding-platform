// Call within the same transaction as the status change. Withdraw new-client
// publications only: existing appointments and office reservations remain intact.
export async function withdrawProviderIntakeOpenings(database, providerId, {inPerson=true, virtual=true, school=true}={}) {
 if(inPerson) {
  await database.execute('UPDATE provider_in_office_availability SET is_available=0 WHERE provider_id=?',[providerId]);
  await database.execute('UPDATE provider_in_person_slot_availability SET is_active=0 WHERE provider_id=? AND end_at>UTC_TIMESTAMP()',[providerId]);
 }
 if(virtual) {
  await database.execute("UPDATE provider_virtual_slot_availability SET available_for_intake=0, session_type='REGULAR', is_active=IF(available_for_session=1,is_active,0) WHERE provider_id=? AND end_at>UTC_TIMESTAMP()",[providerId]);
  await database.execute('DELETE FROM provider_virtual_working_hours WHERE provider_id=? AND available_for_session=0',[providerId]);
  await database.execute("UPDATE provider_virtual_working_hours SET available_for_intake=0,session_type='REGULAR' WHERE provider_id=?",[providerId]);
 }
 if(school) await database.execute('UPDATE provider_school_assignments SET slots_available=0,accepting_new_clients_override=0 WHERE provider_user_id=? AND is_active=1',[providerId]);
 await database.execute('UPDATE provider_availability_reminders SET checked_at=NULL WHERE provider_id=?',[providerId]);
}
