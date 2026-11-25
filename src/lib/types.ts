export type AppRole = 'super_admin' | 'vc' | 'coe' | 'dean' | 'hod' | 'faculty' | 'student';
export type PlanTier = 'pro' | 'elite';

export interface Profile {
  id: string;
  institution_id: string | null;
  email: string;
  full_name: string;
  role: AppRole;
  school_id: string | null;
  department_id: string | null;
  roll_no: string | null;
  active: boolean;
  calendar_token: string;
}

export interface Institution {
  id: string;
  name: string;
  email_domain: string;
  plan: PlanTier | null;
  plan_start: string | null;
  plan_end: string | null;
  min_attendance_pct: number;
  attainment_threshold: number;
}

export interface School {
  id: string;
  institution_id: string;
  name: string;
}

export interface Department {
  id: string;
  institution_id: string;
  school_id: string;
  code: string;
  name: string;
}

export interface InviteRow {
  id: string;
  institution_id: string;
  email: string;
  role: AppRole;
  full_name: string;
  school_id: string | null;
  department_id: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface PlanRow {
  tier: PlanTier;
  total_cap: number;
  daily_cap: number;
}

export interface SubscriptionRequestRow {
  id: string;
  institution_id: string;
  requested_by: string | null;
  plan: PlanTier;
  start_date: string;
  months: number;
  status: 'sent' | 'approved' | 'rejected';
  decided_at: string | null;
  created_at: string;
}

export interface AiUsageReportRow {
  user_id: string;
  full_name: string;
  email: string;
  institution_id: string;
  institution_name: string;
  plan: PlanTier | null;
  plan_end: string | null;
  total_cap: number;
  daily_cap: number;
  used_total: number;
  used_today: number;
}

export interface AuditRow {
  id: string;
  institution_id: string | null;
  actor_id: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  detail: Record<string, unknown>;
  at: string;
}

export function homeForRole(role: AppRole): string {
  switch (role) {
    case 'super_admin':
      return '/admin';
    case 'vc':
    case 'coe':
    case 'dean':
      return '/oversight';
    case 'hod':
      return '/hod';
    case 'faculty':
      return '/faculty';
    case 'student':
      return '/student';
  }
}

export function roleLabel(role: AppRole): string {
  switch (role) {
    case 'super_admin':
      return 'Super admin';
    case 'vc':
      return 'VC';
    case 'coe':
      return 'CoE';
    case 'dean':
      return 'Dean';
    case 'hod':
      return 'HOD';
    case 'faculty':
      return 'Faculty';
    case 'student':
      return 'Student';
  }
}

export type PlanStatus = 'draft' | 'sent' | 'approved' | 'declined';
export type SessionStatus = 'none' | 'draft' | 'active' | 'conducted';

export interface Course {
  id: string;
  institution_id: string;
  department_id: string;
  faculty_id: string;
  code: string;
  title: string;
  ltpc: string;
  programme: string;
  semester: number;
  section: string;
  academic_year: string;
  plan_status: PlanStatus;
  plan_remark: string | null;
  rubric: {
    attendance: number;
    pre_test: number;
    post_test: number;
    visible: number;
    hidden: number;
    viva: number;
  };
  allowed_langs: string[];
  attainment_target: number;
  final_status: string;
}

export interface CourseOutcome {
  id: string;
  course_id: string;
  code: string;
  statement: string;
  btl: number;
  unit: number;
}

export interface CoPoMapRow {
  course_id: string;
  co_id: string;
  po_code: string;
  level: number;
}

export interface BatchRow {
  id: string;
  course_id: string;
  name: string;
  class_code: string;
  slot: string;
  room: string;
  staff: string[];
}

export interface EnrollmentRow {
  id: string;
  batch_id: string;
  course_id: string;
  student_id: string;
}

export interface PendingEnrollmentRow {
  id: string;
  batch_id: string;
  course_id: string;
  email: string;
  roll_no: string;
  full_name: string;
}

export interface SessionRow {
  id: string;
  course_id: string;
  n: number;
  topic: string;
  co_id: string | null;
  btl: number;
  scheduled_date: string | null;
  status: SessionStatus;
}

export interface HolidayRow {
  id: string;
  institution_id: string;
  day: string;
  label: string;
}

export interface AiUsageSummary {
  plan: PlanTier | null;
  total_cap: number;
  daily_cap: number;
  used_total: number;
  used_today: number;
  plan_end: string | null;
}

export interface QuestionRow {
  id: string;
  course_id: string;
  kind: 'lab' | 'endsem' | 'task';
  session_id: string | null;
  co_code: string;
  difficulty: 'easy' | 'medium' | 'hard';
  title: string;
  statement: string;
  input_spec: string;
  output_spec: string;
  constraints: string;
  status: 'candidate' | 'approved' | 'rejected';
  source: 'ai' | 'faculty';
  valid: boolean;
  validation_note: string | null;
}

export interface SessionQuestionRow {
  session_id: string;
  slot: 1 | 2;
  question_id: string;
}

export interface BankItemRow {
  id: string;
  session_id: string;
  bank: 'pre' | 'post';
  level: 'easy' | 'medium' | 'hard';
  stem: string;
  options: string[];
  answer: number;
  approved: boolean;
}

export interface SessionRunRow {
  id: string;
  session_id: string;
  batch_id: string;
  started_at: string | null;
  ended_at: string | null;
  attendance_done: boolean;
  post_close: string | null;
  remark: string | null;
}

export interface AttendanceRow {
  id: string;
  session_run_id: string;
  student_id: string;
  state: 'present' | 'late' | 'absent';
}

export interface TestAttemptRow {
  id: string;
  session_id: string;
  student_id: string;
  bank: 'pre' | 'post';
  item_ids: string[];
  answers: Record<string, number>;
  score: number;
  started_at: string;
  submitted_at: string | null;
}

export interface SubmissionRow {
  id: string;
  course_id: string;
  session_id: string | null;
  student_id: string;
  question_id: string;
  context: 'lab' | 'exam';
  lang: string;
  code: string;
  visible_passed: number;
  visible_total: number;
  hidden_passed: number;
  hidden_total: number;
  runtime_ms: number;
  created_at: string;
}

export interface VivaRow {
  id: string;
  student_id: string;
  session_id: string | null;
  marks: number;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
