-- Migration: Clear user activity log table
-- Description: Truncate the user_activity_log table to remove all existing broken data
-- This is part of rebuilding the activity log system with a centralized service

TRUNCATE TABLE user_activity_log;
