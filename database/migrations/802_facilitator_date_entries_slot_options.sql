-- Extend facilitator availability date entries to support the new slot-based preference model.
-- Replaces the binary available/waitlist/unavailable with a four-way primary preference plus
-- secondary willingness flags for waitlist and on-call.

ALTER TABLE facilitator_availability_date_entries
  MODIFY COLUMN availability
    ENUM('slot', 'waitlist', 'oncall', 'unavailable', 'available')
    NOT NULL DEFAULT 'unavailable'
    COMMENT 'slot=wants a primary slot; waitlist=waitlist only; oncall=on-call only; unavailable=not available. ''available'' kept for legacy rows.',
  ADD COLUMN waitlist_willing TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Also willing to be waitlisted if not assigned (used when primary=slot).'
    AFTER availability,
  ADD COLUMN oncall_willing TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Also willing to be on-call if not assigned (used when primary=slot or waitlist).'
    AFTER waitlist_willing;
