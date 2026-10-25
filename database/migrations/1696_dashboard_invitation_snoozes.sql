CREATE TABLE IF NOT EXISTS dashboard_invitation_snoozes (
  user_id INT NOT NULL,
  invitation_key VARCHAR(191) NOT NULL,
  snoozed_until DATETIME NOT NULL,
  PRIMARY KEY (user_id, invitation_key)
);
