ALTER TABLE client_school_staff_roi_access
  MODIFY COLUMN access_level ENUM('packet', 'roi', 'roi_docs') NOT NULL DEFAULT 'packet';
