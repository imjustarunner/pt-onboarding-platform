-- Support tickets: close when requester reads answer

ALTER TABLE support_tickets
  ADD COLUMN close_on_read TINYINT(1) NOT NULL DEFAULT 0 AFTER status;
