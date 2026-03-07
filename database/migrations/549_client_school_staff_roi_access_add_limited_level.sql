ALTER TABLE client_school_staff_roi_access
  MODIFY COLUMN access_level ENUM('packet', 'limited', 'roi', 'roi_docs') NOT NULL DEFAULT 'packet';
