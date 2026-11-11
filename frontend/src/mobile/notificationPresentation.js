import {Bell,CalendarDays,ClipboardCheck,FileCheck2,MessageSquare,Megaphone,Receipt,ShieldCheck,Target,UserRound,Camera,Ticket,Handshake} from '@lucide/vue';
const categories={account_security:ShieldCheck,user_activity:UserRound,tasks_messaging:MessageSquare,clients_documents:FileCheck2,scheduling_office:CalendarDays,events_registration:Ticket,payroll_billing:Receipt,onboarding_hiring:Handshake,supervision_programs:Target,recognition_announcements:Megaphone,marketing:Camera};
export function notificationIcon(item={}){if(/^(?:custom_task_|task_|hiring_task_)/.test(item.type||''))return ClipboardCheck;return categories[item.catalog?.category] || Bell;}
export function notificationColor(item={}){return /^#[a-f0-9]{6}$/i.test(item.catalog?.color || '')?item.catalog.color:'#5577ad';}
export function notificationTomorrow(now=new Date()){const tomorrow=new Date(now);tomorrow.setDate(tomorrow.getDate()+1);tomorrow.setHours(9,0,0,0);return tomorrow.toISOString();}
