-- Shared public snapshots across Cloud Run instances. No patient/busy-event data.
CREATE TABLE IF NOT EXISTS public_read_snapshots (
  cache_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  kind VARCHAR(24) NOT NULL,
  provider_id INT NULL,
  payload JSON NULL,
  expires_at DATETIME(3) NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  lease_until DATETIME(3) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_public_snapshot_provider (provider_id),
  KEY idx_public_snapshot_kind (kind),
  KEY idx_public_snapshot_cleanup (updated_at)
) ENGINE=InnoDB;

-- Invalidation commits/rolls back with the source edit, including raw SQL and
-- cross-agency bookings. Removing a lease prevents an in-flight stale publication.

DROP TRIGGER IF EXISTS pub_snap_provider_public_profiles_i;
CREATE TRIGGER pub_snap_provider_public_profiles_i AFTER INSERT ON provider_public_profiles
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_public_profiles_u;
CREATE TRIGGER pub_snap_provider_public_profiles_u AFTER UPDATE ON provider_public_profiles
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.user_id,NEW.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_public_profiles_d;
CREATE TRIGGER pub_snap_provider_public_profiles_d AFTER DELETE ON provider_public_profiles
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_user_agencies_i;
CREATE TRIGGER pub_snap_user_agencies_i AFTER INSERT ON user_agencies
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_user_agencies_u;
CREATE TRIGGER pub_snap_user_agencies_u AFTER UPDATE ON user_agencies
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.user_id,NEW.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_user_agencies_d;
CREATE TRIGGER pub_snap_user_agencies_d AFTER DELETE ON user_agencies
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_virtual_working_hours_i;
CREATE TRIGGER pub_snap_provider_virtual_working_hours_i AFTER INSERT ON provider_virtual_working_hours
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_virtual_working_hours_u;
CREATE TRIGGER pub_snap_provider_virtual_working_hours_u AFTER UPDATE ON provider_virtual_working_hours
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_id,NEW.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_virtual_working_hours_d;
CREATE TRIGGER pub_snap_provider_virtual_working_hours_d AFTER DELETE ON provider_virtual_working_hours
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_virtual_slot_availability_i;
CREATE TRIGGER pub_snap_provider_virtual_slot_availability_i AFTER INSERT ON provider_virtual_slot_availability
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_virtual_slot_availability_u;
CREATE TRIGGER pub_snap_provider_virtual_slot_availability_u AFTER UPDATE ON provider_virtual_slot_availability
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_id,NEW.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_virtual_slot_availability_d;
CREATE TRIGGER pub_snap_provider_virtual_slot_availability_d AFTER DELETE ON provider_virtual_slot_availability
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_in_person_slot_availability_i;
CREATE TRIGGER pub_snap_provider_in_person_slot_availability_i AFTER INSERT ON provider_in_person_slot_availability
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_in_person_slot_availability_u;
CREATE TRIGGER pub_snap_provider_in_person_slot_availability_u AFTER UPDATE ON provider_in_person_slot_availability
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_id,NEW.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_in_person_slot_availability_d;
CREATE TRIGGER pub_snap_provider_in_person_slot_availability_d AFTER DELETE ON provider_in_person_slot_availability
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_school_assignments_i;
CREATE TRIGGER pub_snap_provider_school_assignments_i AFTER INSERT ON provider_school_assignments
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.provider_user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_school_assignments_u;
CREATE TRIGGER pub_snap_provider_school_assignments_u AFTER UPDATE ON provider_school_assignments
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_user_id,NEW.provider_user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_school_assignments_d;
CREATE TRIGGER pub_snap_provider_school_assignments_d AFTER DELETE ON provider_school_assignments
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_office_standing_assignments_i;
CREATE TRIGGER pub_snap_office_standing_assignments_i AFTER INSERT ON office_standing_assignments
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_office_standing_assignments_u;
CREATE TRIGGER pub_snap_office_standing_assignments_u AFTER UPDATE ON office_standing_assignments
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_id,NEW.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_office_standing_assignments_d;
CREATE TRIGGER pub_snap_office_standing_assignments_d AFTER DELETE ON office_standing_assignments
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_public_provider_slot_holds_i;
CREATE TRIGGER pub_snap_public_provider_slot_holds_i AFTER INSERT ON public_provider_slot_holds
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_public_provider_slot_holds_u;
CREATE TRIGGER pub_snap_public_provider_slot_holds_u AFTER UPDATE ON public_provider_slot_holds
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_id,NEW.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_public_provider_slot_holds_d;
CREATE TRIGGER pub_snap_public_provider_slot_holds_d AFTER DELETE ON public_provider_slot_holds
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_public_appointment_requests_i;
CREATE TRIGGER pub_snap_public_appointment_requests_i AFTER INSERT ON public_appointment_requests
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_public_appointment_requests_u;
CREATE TRIGGER pub_snap_public_appointment_requests_u AFTER UPDATE ON public_appointment_requests
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_id,NEW.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_public_appointment_requests_d;
CREATE TRIGGER pub_snap_public_appointment_requests_d AFTER DELETE ON public_appointment_requests
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_public_service_enrollments_i;
CREATE TRIGGER pub_snap_provider_public_service_enrollments_i AFTER INSERT ON provider_public_service_enrollments
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_public_service_enrollments_u;
CREATE TRIGGER pub_snap_provider_public_service_enrollments_u AFTER UPDATE ON provider_public_service_enrollments
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.user_id,NEW.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_public_service_enrollments_d;
CREATE TRIGGER pub_snap_provider_public_service_enrollments_d AFTER DELETE ON provider_public_service_enrollments
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_user_info_values_i;
CREATE TRIGGER pub_snap_user_info_values_i AFTER INSERT ON user_info_values
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_user_info_values_u;
CREATE TRIGGER pub_snap_user_info_values_u AFTER UPDATE ON user_info_values
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.user_id,NEW.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_user_info_values_d;
CREATE TRIGGER pub_snap_user_info_values_d AFTER DELETE ON user_info_values
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_insurance_overrides_i;
CREATE TRIGGER pub_snap_provider_insurance_overrides_i AFTER INSERT ON provider_insurance_overrides
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.provider_user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_insurance_overrides_u;
CREATE TRIGGER pub_snap_provider_insurance_overrides_u AFTER UPDATE ON provider_insurance_overrides
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_user_id,NEW.provider_user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_provider_insurance_overrides_d;
CREATE TRIGGER pub_snap_provider_insurance_overrides_d AFTER DELETE ON provider_insurance_overrides
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.provider_user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_user_insurance_credentialing_i;
CREATE TRIGGER pub_snap_user_insurance_credentialing_i AFTER INSERT ON user_insurance_credentialing
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_user_insurance_credentialing_u;
CREATE TRIGGER pub_snap_user_insurance_credentialing_u AFTER UPDATE ON user_insurance_credentialing
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.user_id,NEW.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_user_insurance_credentialing_d;
CREATE TRIGGER pub_snap_user_insurance_credentialing_d AFTER DELETE ON user_insurance_credentialing
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_user_external_calendars_i;
CREATE TRIGGER pub_snap_user_external_calendars_i AFTER INSERT ON user_external_calendars
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_user_external_calendars_u;
CREATE TRIGGER pub_snap_user_external_calendars_u AFTER UPDATE ON user_external_calendars
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.user_id,NEW.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_user_external_calendars_d;
CREATE TRIGGER pub_snap_user_external_calendars_d AFTER DELETE ON user_external_calendars
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.user_id) OR kind='website';

DROP TRIGGER IF EXISTS pub_snap_users_i;
CREATE TRIGGER pub_snap_users_i AFTER INSERT ON users
FOR EACH ROW DELETE FROM public_read_snapshots WHERE (provider_id=NEW.id OR kind='website');

DROP TRIGGER IF EXISTS pub_snap_users_u;
CREATE TRIGGER pub_snap_users_u AFTER UPDATE ON users
FOR EACH ROW DELETE FROM public_read_snapshots WHERE (provider_id=NEW.id OR kind='website') AND (NOT (OLD.first_name <=> NEW.first_name) OR NOT (OLD.last_name <=> NEW.last_name) OR NOT (OLD.title <=> NEW.title) OR NOT (OLD.credential <=> NEW.credential) OR NOT (OLD.department <=> NEW.department) OR NOT (OLD.sees_clients <=> NEW.sees_clients) OR NOT (OLD.has_provider_access <=> NEW.has_provider_access) OR NOT (OLD.has_supervisor_privileges <=> NEW.has_supervisor_privileges) OR NOT (OLD.profile_photo_path <=> NEW.profile_photo_path) OR NOT (OLD.provider_school_info_blurb <=> NEW.provider_school_info_blurb) OR NOT (OLD.languages_spoken <=> NEW.languages_spoken) OR NOT (OLD.provider_accepting_new_clients <=> NEW.provider_accepting_new_clients) OR NOT (OLD.in_office_available <=> NEW.in_office_available) OR NOT (OLD.role <=> NEW.role) OR NOT (OLD.is_archived <=> NEW.is_archived) OR NOT (OLD.is_demo <=> NEW.is_demo) OR NOT (OLD.is_active <=> NEW.is_active) OR NOT (OLD.status <=> NEW.status) OR NOT (OLD.email <=> NEW.email) OR NOT (OLD.external_busy_ics_url <=> NEW.external_busy_ics_url));

DROP TRIGGER IF EXISTS pub_snap_users_d;
CREATE TRIGGER pub_snap_users_d AFTER DELETE ON users
FOR EACH ROW DELETE FROM public_read_snapshots WHERE (provider_id=OLD.id OR kind='website');

DROP TRIGGER IF EXISTS pub_snap_office_events_i;
CREATE TRIGGER pub_snap_office_events_i AFTER INSERT ON office_events
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (NEW.assigned_provider_id,NEW.booked_provider_id);

DROP TRIGGER IF EXISTS pub_snap_office_events_u;
CREATE TRIGGER pub_snap_office_events_u AFTER UPDATE ON office_events
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.assigned_provider_id,OLD.booked_provider_id,NEW.assigned_provider_id,NEW.booked_provider_id) AND (NOT (OLD.assigned_provider_id <=> NEW.assigned_provider_id) OR NOT (OLD.booked_provider_id <=> NEW.booked_provider_id) OR NOT (OLD.office_location_id <=> NEW.office_location_id) OR NOT (OLD.room_id <=> NEW.room_id) OR NOT (OLD.start_at <=> NEW.start_at) OR NOT (OLD.end_at <=> NEW.end_at) OR NOT (OLD.status <=> NEW.status) OR NOT (OLD.slot_state <=> NEW.slot_state));

DROP TRIGGER IF EXISTS pub_snap_office_events_d;
CREATE TRIGGER pub_snap_office_events_d AFTER DELETE ON office_events
FOR EACH ROW DELETE FROM public_read_snapshots WHERE provider_id IN (OLD.assigned_provider_id,OLD.booked_provider_id);

DROP TRIGGER IF EXISTS pub_snap_agencies_i;
CREATE TRIGGER pub_snap_agencies_i AFTER INSERT ON agencies
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_agencies_u;
CREATE TRIGGER pub_snap_agencies_u AFTER UPDATE ON agencies
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_agencies_d;
CREATE TRIGGER pub_snap_agencies_d AFTER DELETE ON agencies
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_office_locations_i;
CREATE TRIGGER pub_snap_office_locations_i AFTER INSERT ON office_locations
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_office_locations_u;
CREATE TRIGGER pub_snap_office_locations_u AFTER UPDATE ON office_locations
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_office_locations_d;
CREATE TRIGGER pub_snap_office_locations_d AFTER DELETE ON office_locations
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_office_location_agencies_i;
CREATE TRIGGER pub_snap_office_location_agencies_i AFTER INSERT ON office_location_agencies
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_office_location_agencies_u;
CREATE TRIGGER pub_snap_office_location_agencies_u AFTER UPDATE ON office_location_agencies
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_office_location_agencies_d;
CREATE TRIGGER pub_snap_office_location_agencies_d AFTER DELETE ON office_location_agencies
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_office_rooms_i;
CREATE TRIGGER pub_snap_office_rooms_i AFTER INSERT ON office_rooms
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_office_rooms_u;
CREATE TRIGGER pub_snap_office_rooms_u AFTER UPDATE ON office_rooms
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_office_rooms_d;
CREATE TRIGGER pub_snap_office_rooms_d AFTER DELETE ON office_rooms
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_agency_provider_portal_settings_i;
CREATE TRIGGER pub_snap_agency_provider_portal_settings_i AFTER INSERT ON agency_provider_portal_settings
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_agency_provider_portal_settings_u;
CREATE TRIGGER pub_snap_agency_provider_portal_settings_u AFTER UPDATE ON agency_provider_portal_settings
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_agency_provider_portal_settings_d;
CREATE TRIGGER pub_snap_agency_provider_portal_settings_d AFTER DELETE ON agency_provider_portal_settings
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_agency_public_service_types_i;
CREATE TRIGGER pub_snap_agency_public_service_types_i AFTER INSERT ON agency_public_service_types
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_agency_public_service_types_u;
CREATE TRIGGER pub_snap_agency_public_service_types_u AFTER UPDATE ON agency_public_service_types
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_agency_public_service_types_d;
CREATE TRIGGER pub_snap_agency_public_service_types_d AFTER DELETE ON agency_public_service_types
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_district_schedule_hidden_providers_i;
CREATE TRIGGER pub_snap_district_schedule_hidden_providers_i AFTER INSERT ON district_schedule_hidden_providers
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_district_schedule_hidden_providers_u;
CREATE TRIGGER pub_snap_district_schedule_hidden_providers_u AFTER UPDATE ON district_schedule_hidden_providers
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_district_schedule_hidden_providers_d;
CREATE TRIGGER pub_snap_district_schedule_hidden_providers_d AFTER DELETE ON district_schedule_hidden_providers
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_district_schedule_hidden_schools_i;
CREATE TRIGGER pub_snap_district_schedule_hidden_schools_i AFTER INSERT ON district_schedule_hidden_schools
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_district_schedule_hidden_schools_u;
CREATE TRIGGER pub_snap_district_schedule_hidden_schools_u AFTER UPDATE ON district_schedule_hidden_schools
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_district_schedule_hidden_schools_d;
CREATE TRIGGER pub_snap_district_schedule_hidden_schools_d AFTER DELETE ON district_schedule_hidden_schools
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_organization_affiliations_i;
CREATE TRIGGER pub_snap_organization_affiliations_i AFTER INSERT ON organization_affiliations
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_organization_affiliations_u;
CREATE TRIGGER pub_snap_organization_affiliations_u AFTER UPDATE ON organization_affiliations
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_organization_affiliations_d;
CREATE TRIGGER pub_snap_organization_affiliations_d AFTER DELETE ON organization_affiliations
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_agency_schools_i;
CREATE TRIGGER pub_snap_agency_schools_i AFTER INSERT ON agency_schools
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_agency_schools_u;
CREATE TRIGGER pub_snap_agency_schools_u AFTER UPDATE ON agency_schools
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_agency_schools_d;
CREATE TRIGGER pub_snap_agency_schools_d AFTER DELETE ON agency_schools
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_public_marketing_pages_i;
CREATE TRIGGER pub_snap_public_marketing_pages_i AFTER INSERT ON public_marketing_pages
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_public_marketing_pages_u;
CREATE TRIGGER pub_snap_public_marketing_pages_u AFTER UPDATE ON public_marketing_pages
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_public_marketing_pages_d;
CREATE TRIGGER pub_snap_public_marketing_pages_d AFTER DELETE ON public_marketing_pages
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_mental_range_memberships_i;
CREATE TRIGGER pub_snap_mental_range_memberships_i AFTER INSERT ON mental_range_memberships
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_mental_range_memberships_u;
CREATE TRIGGER pub_snap_mental_range_memberships_u AFTER UPDATE ON mental_range_memberships
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_mental_range_memberships_d;
CREATE TRIGGER pub_snap_mental_range_memberships_d AFTER DELETE ON mental_range_memberships
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_user_external_calendar_feeds_i;
CREATE TRIGGER pub_snap_user_external_calendar_feeds_i AFTER INSERT ON user_external_calendar_feeds
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_user_external_calendar_feeds_u;
CREATE TRIGGER pub_snap_user_external_calendar_feeds_u AFTER UPDATE ON user_external_calendar_feeds
FOR EACH ROW DELETE FROM public_read_snapshots;

DROP TRIGGER IF EXISTS pub_snap_user_external_calendar_feeds_d;
CREATE TRIGGER pub_snap_user_external_calendar_feeds_d AFTER DELETE ON user_external_calendar_feeds
FOR EACH ROW DELETE FROM public_read_snapshots;
