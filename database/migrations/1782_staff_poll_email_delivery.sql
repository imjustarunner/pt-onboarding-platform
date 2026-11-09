-- SSO staff without polling SMS consent can receive a signed-in voting link.
ALTER TABLE company_event_dispatch_logs
  MODIFY COLUMN channel ENUM('in_app','sms','email') NOT NULL;
