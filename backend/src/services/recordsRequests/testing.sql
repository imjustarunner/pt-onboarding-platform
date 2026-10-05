-- Disposable-test projection of shared identities and support tables.
CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(255),slug VARCHAR(100),organization_type VARCHAR(32),is_active TINYINT,logo_url TEXT,logo_path TEXT,color_palette JSON);
CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(80),last_name VARCHAR(80),role VARCHAR(40),status VARCHAR(40),is_active TINYINT DEFAULT 1,is_archived TINYINT DEFAULT 0);
CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active TINYINT DEFAULT 1);
CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,full_name VARCHAR(255));
CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,access_enabled TINYINT);
CREATE TABLE support_tickets(id INT AUTO_INCREMENT PRIMARY KEY,school_organization_id INT,agency_id INT,created_by_user_id INT NULL,created_by_source_key VARCHAR(64),subject VARCHAR(255),question TEXT,status VARCHAR(32),priority VARCHAR(16),claimed_by_user_id INT,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
INSERT INTO agencies(id,name,slug,organization_type,is_active) VALUES(10,'Practice One','one','agency',1),(20,'Practice Two','two','clinical',1);
INSERT INTO users(id,first_name,last_name,role,status) VALUES(11,'Primary','Test','admin','ACTIVE_EMPLOYEE'),(12,'Backup','One','super_admin','ACTIVE_EMPLOYEE'),(13,'Backup','Two','admin','ACTIVE_EMPLOYEE'),(14,'Support','Only','support','ACTIVE_EMPLOYEE'),(15,'Admin','Only','admin','ACTIVE_EMPLOYEE'),(100,'Guardian','Test','client_guardian','ACTIVE_EMPLOYEE');
INSERT INTO user_agencies(user_id,agency_id) VALUES(11,10),(12,10),(13,10),(14,10),(15,10),(15,20);
INSERT INTO clients VALUES(101,10,'Synthetic Patient'),(202,20,'Other Patient');
INSERT INTO client_guardians VALUES(101,100,1);
