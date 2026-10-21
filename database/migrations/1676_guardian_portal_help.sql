-- A retry of the same authenticated report must not create another ticket.
CREATE TABLE IF NOT EXISTS guardian_portal_help_requests (
 guardian_user_id INT NOT NULL,
 request_id CHAR(36) NOT NULL,
 agency_id INT NOT NULL,
 client_id INT NOT NULL,
 ticket_id INT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (guardian_user_id,request_id),
 KEY guardian_portal_help_ticket (ticket_id)
);
