ALTER TABLE public_website_chat_sessions
 ADD COLUMN page_path VARCHAR(500) NOT NULL DEFAULT '/',
 ADD COLUMN initiated_at DATETIME NULL,
 ADD COLUMN visitor_left_at DATETIME NULL,
 ADD COLUMN visitor_ended_at DATETIME NULL,
 ADD COLUMN visitor_typing_at DATETIME NULL,
 ADD COLUMN claimed_by INT NULL,
 ADD COLUMN standards_flagged_at DATETIME NULL;
ALTER TABLE public_website_chat_messages MODIFY sender ENUM('visitor','staff','system') NOT NULL;
CREATE TABLE public_website_chat_participants (
 session_id CHAR(36) NOT NULL,
 user_id INT NOT NULL,
 member_number INT NOT NULL,
 viewing_at DATETIME NULL,
 typing_at DATETIME NULL,
 PRIMARY KEY(session_id,user_id),
 UNIQUE KEY(session_id,member_number),
 FOREIGN KEY(session_id) REFERENCES public_website_chat_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE public_website_chat_referrals (
 token_hash CHAR(64) PRIMARY KEY,
 session_id CHAR(36) NOT NULL,
 author_user_id INT NULL,
 category VARCHAR(80) NOT NULL DEFAULT '',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 clicked_at DATETIME NULL,
 ticket_id INT NULL,
 FOREIGN KEY(session_id) REFERENCES public_website_chat_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Preserve invitations from conversations that were already in progress.
UPDATE public_website_chat_sessions c SET initiated_at=(SELECT MIN(m.created_at) FROM public_website_chat_messages m WHERE m.session_id=c.id AND m.sender='staff');
INSERT INTO public_website_chat_participants(session_id,user_id,member_number)
 SELECT session_id,author_user_id,ROW_NUMBER() OVER(PARTITION BY session_id ORDER BY MIN(id))
 FROM public_website_chat_messages WHERE sender='staff' AND author_user_id IS NOT NULL GROUP BY session_id,author_user_id;
