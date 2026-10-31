import { it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import Task from '../Task.model.js';
it('personal briefing includes explicit assignees, roles and collaborators while leaving agency projects in the task hub',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id INTEGER,role TEXT); INSERT INTO users VALUES(1,'provider'),(2,'admin');
 CREATE TABLE tasks(id INTEGER,assigned_to_user_id INTEGER,assigned_to_role TEXT); INSERT INTO tasks VALUES(10,NULL,NULL),(11,1,NULL),(12,NULL,'provider'),(13,NULL,NULL),(14,2,NULL);
 CREATE TABLE task_collaborators(task_id INTEGER,user_id INTEGER); INSERT INTO task_collaborators VALUES(13,1);`);
 const base='SELECT t.id FROM tasks t WHERE 1=1';
 const personal=Task._appendHubFilters(base,[],{view:'personal',userId:1});
 expect(db.prepare(personal.query+' ORDER BY t.id').all(...personal.params).map(row=>row.id)).toEqual([11,12,13]);
 const hub=Task._appendHubFilters(base,[],{});
 expect(db.prepare(hub.query).all()).toHaveLength(5);
 db.close();
});
