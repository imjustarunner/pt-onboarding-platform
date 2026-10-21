-- Keep inferred types before simplifying office titles. Existing links and Google resource IDs stay intact.
CREATE TABLE IF NOT EXISTS office_room_catalog_originals (
 room_id INT PRIMARY KEY, original_name VARCHAR(255), original_label VARCHAR(255), recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT IGNORE INTO office_room_catalog_originals (room_id,original_name,original_label)
 SELECT id,name,label FROM office_rooms;
INSERT IGNORE INTO office_room_types (office_location_id,name,sort_order)
 SELECT l.id,t.name,t.sort_order FROM office_locations l CROSS JOIN (
  SELECT 'Counseling Office' name,0 sort_order UNION ALL SELECT 'Play Room',1 UNION ALL SELECT 'Tutoring Room',2 UNION ALL SELECT 'Group Room',3
 ) t WHERE l.is_active=1;
-- Replace the old generic therapy label with the standard counseling type, keeping all links.
INSERT IGNORE INTO office_room_type_links (room_id,room_type_id)
 SELECT k.room_id,n.id FROM office_room_type_links k JOIN office_room_types old ON old.id=k.room_type_id
 JOIN office_room_types n ON n.office_location_id=old.office_location_id AND n.name='Counseling Office'
 WHERE old.name='Therapy Room';
DELETE k FROM office_room_type_links k JOIN office_room_types t ON t.id=k.room_type_id WHERE t.name='Therapy Room';
UPDATE office_room_types SET is_active=0 WHERE name='Therapy Room';
INSERT IGNORE INTO office_room_type_links (room_id,room_type_id)
 SELECT r.id,t.id FROM office_rooms r JOIN office_room_catalog_originals o ON o.room_id=r.id
 JOIN office_room_types t ON t.office_location_id=r.location_id AND t.is_active=1
 WHERE (t.name='Play Room' AND LOWER(CONCAT(COALESCE(o.original_label,''),' ',o.original_name)) REGEXP 'play|day.?care')
 OR (t.name='Tutoring Room' AND LOWER(CONCAT(COALESCE(o.original_label,''),' ',o.original_name)) REGEXP 'tutor|learning')
 OR (t.name='Group Room' AND LOWER(CONCAT(COALESCE(o.original_label,''),' ',o.original_name)) REGEXP 'group|conference')
 OR (t.name='Counseling Office' AND LOWER(CONCAT(COALESCE(o.original_label,''),' ',o.original_name)) REGEXP 'counsel|therapy room');
UPDATE office_rooms SET name=CONCAT('Office #',room_number),label=CONCAT('Office #',room_number) WHERE room_number IS NOT NULL;
