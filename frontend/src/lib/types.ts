export type Role = "director" | "admin" | "teacher" | "student";

export interface Me {
  id: number; username: string; full_name: string; first_name: string; last_name: string; middle_name: string;
  role: Role; phone: string; avatar_url: string | null; email: string; birth_date: string | null; gender: string;
  must_change_password: boolean; theme: string; telegram_alerts: boolean; teacher_id: number | null;
  student: { id: number; class_id: number | null; class_name: string | null; student_no: string } | null;
  telegram_linked: boolean; last_login: string | null;
}

export interface Paged<T> { count: number; next: string | null; previous: string | null; results: T[] }

export interface Lesson {
  id: number; school_class: number; class_name: string; subject: number; subject_name: string; subject_color: string; subject_icon: string;
  teacher: number | null; teacher_name: string | null; weekday: number; period: number; start: string | null; end: string | null; room: string;
  state?: "now" | "next" | "done" | "upcoming";
}

export interface FileInfo { id: number; name: string; mime: string; size: number; is_image: boolean; url: string; attempt?: number }

export interface HomeworkItem {
  id: number; title: string; subject: { id: number; name: string; color: string; icon: string }; school_class: { id: number; name: string };
  teacher_name: string; due_at: string; max_score: number; allow_late: boolean; is_closed: boolean; is_overdue: boolean; created_at: string;
  file_count: number | null;
  stats: { submitted: number; to_review: number | null; accepted: number | null; students: number | null } | null;
  my: { state: HwState; score: number | null; submitted_at: string | null; submission_id: number | null } | null;
}
export type HwState = "pending" | "submitted" | "revision" | "accepted" | "overdue" | "missed";

export interface SubmissionT {
  id: number; status: "submitted" | "revision" | "accepted"; comment: string; attempt: number; is_late: boolean; submitted_at: string;
  score: number | null; feedback: string; reviewed_at: string | null; reviewed_by_name: string | null; files: FileInfo[];
  student: { id: number; full_name: string; avatar_url: string | null };
  homework: { id: number; title: string; max_score: number; due_at: string; class_name: string; subject: { name: string; color: string } };
  events: { id: number; action: string; actor_name: string | null; note: string; score: number | null; created_at: string }[];
}

export interface HomeworkDetail extends HomeworkItem { description: string; files: FileInfo[]; my_submission: SubmissionT | null; can_edit: boolean }

export interface Announcement {
  id: number; title: string; body: string; author: { id: number; full_name: string; role: Role; avatar_url: string | null } | null;
  audience: string; classes: number[]; class_names: string[]; pinned: boolean; important: boolean; attachment_url: string | null;
  attachment_name: string; source: string; created_at: string; can_edit: boolean;
}

export interface EventT {
  id: number; title: string; description: string; kind: string; starts_at: string; ends_at: string | null; location: string;
  audience: string; classes: number[]; class_names: string[]; created_by_name: string | null; can_edit: boolean;
}

export interface SchoolClass { id: number; grade: number; letter: string; name: string; room: string; shift: number; homeroom_teacher: number | null; homeroom_teacher_name: string | null; student_count?: number; is_active: boolean }
export interface Subject { id: number; name: string; short: string; color: string; icon: string; teacher_count?: number }

export interface Teacher {
  id: number; user_id: number; full_name: string; first_name: string; last_name: string; middle_name: string; username: string; phone: string;
  birth_date: string | null; gender: string; is_active: boolean; avatar_url: string | null; last_login: string | null; position: string;
  subjects: number[]; subject_names: string[]; category: string; hired_at: string | null; bio: string; track_attendance: boolean;
  classes: { id: number; name: string; subjects: string[] }[]; face_status: "no_consent" | "consent" | "pending" | "approved"; pin_set: boolean;
  temp_password?: string;
}
export interface Student {
  id: number; user_id: number; full_name: string; first_name: string; last_name: string; middle_name: string; username: string; phone: string;
  birth_date: string | null; gender: string; is_active: boolean; avatar_url: string | null; last_login: string | null; school_class: number | null;
  class_name: string | null; student_no: string; parent_name: string; parent_phone: string; address: string; temp_password?: string;
}
export interface Assignment { id: number; teacher: number; teacher_name: string; school_class: number; class_name: string; subject: number; subject_name: string; subject_color: string; hours_per_week: number }

export interface Notif { id: number; kind: string; title: string; body: string; link: string; read_at: string | null; created_at: string }
