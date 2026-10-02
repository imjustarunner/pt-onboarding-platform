-- One care-team conversation per child; existing private conversations are not merged.
CREATE TABLE IF NOT EXISTS guardian_client_threads (
  client_id INT NOT NULL PRIMARY KEY,
  agency_id INT NOT NULL,
  thread_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY guardian_client_thread (thread_id),
  KEY guardian_client_agency (agency_id)
);
