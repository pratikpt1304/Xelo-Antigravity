import { useNavigate, useParams } from 'react-router-dom';
import { Card, ErrorNote, Loading } from '../../../components/ui';
import { useLoad } from '../../../lib/hooks';
import { must, rpc, supabase } from '../../../lib/supabase';
import type {
  AiUsageSummary,
  BankItemRow,
  BatchRow,
  CoPoMapRow,
  Course,
  CourseOutcome,
  EnrollmentRow,
  HolidayRow,
  PendingEnrollmentRow,
  QuestionRow,
  SessionQuestionRow,
  SessionRow,
} from '../../../lib/types';
import { BanksStep } from './BanksStep';
import { BatchesStep } from './BatchesStep';
import { ClassroomStep } from './ClassroomStep';
import { CourseSetupStep } from './CourseSetupStep';
import { FacultyShell, type FacultyStepDef } from './FacultyShell';
import { LabQuestionsStep } from './LabQuestionsStep';
import { ReportsStep } from './ReportsStep';
import { AssessmentsStep } from './AssessmentsStep';
import { SessionPlanStep } from './SessionPlanStep';
import { SessionsStep } from './SessionsStep';

export function FacultyWorkspace() {
  const { courseId, step = 'setup' } = useParams<{ courseId: string; step?: string }>();
  const navigate = useNavigate();

  const { data, loading, error, reload } = useLoad(async () => {
    if (!courseId) throw new Error('not_found');
    const [
      courseRes,
      coRes,
      mapRes,
      batchRes,
      enrRes,
      pendRes,
      sessRes,
      holRes,
      qRes,
      sqRes,
      bankRes,
      aiUsage,
    ] = await Promise.all([
      supabase.from('courses').select('*').eq('id', courseId).single(),
      supabase.from('course_outcomes').select('*').eq('course_id', courseId).order('code'),
      supabase.from('co_po_map').select('*').eq('course_id', courseId),
      supabase.from('batches').select('*').eq('course_id', courseId).order('name'),
      supabase.from('enrollments').select('*').eq('course_id', courseId),
      supabase.from('pending_enrollments').select('*').eq('course_id', courseId),
      supabase.from('sessions').select('*').eq('course_id', courseId).order('n'),
      supabase.from('holidays').select('*').order('day'),
      supabase.from('questions').select('*').eq('course_id', courseId).order('created_at'),
      supabase.from('session_questions').select('*'),
      supabase.from('bank_items').select('*').order('created_at'),
      rpc<AiUsageSummary>('ai_usage').catch(() => null),
    ]);

    return {
      course: must(courseRes) as Course,
      outcomes: must(coRes) as CourseOutcome[],
      coPoMap: must(mapRes) as CoPoMapRow[],
      batches: must(batchRes) as BatchRow[],
      enrollments: must(enrRes) as EnrollmentRow[],
      pending: must(pendRes) as PendingEnrollmentRow[],
      sessions: must(sessRes) as SessionRow[],
      holidays: must(holRes) as HolidayRow[],
      questions: must(qRes) as QuestionRow[],
      sessionQuestions: must(sqRes) as SessionQuestionRow[],
      bankItems: must(bankRes) as BankItemRow[],
      aiUsage,
    };
  }, [courseId]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorNote message={error ?? 'Course not found'} />;

  const planApproved = data.course.plan_status === 'approved';
  const prepareReady = planApproved && data.sessions.length > 0;
  const activeCount = data.sessions.filter(
    (s) => s.status === 'active' || s.status === 'conducted',
  ).length;

  const steps: FacultyStepDef[] = [
    { id: 'setup', group: 'Plan', label: '1. Course setup', meta: data.course.plan_status, locked: false },
    { id: 'batches', group: 'Plan', label: '2. Batches', meta: String(data.batches.length), locked: false },
    {
      id: 'sessions-plan',
      group: 'Plan',
      label: '3. Session plan',
      meta: `${activeCount}/${data.sessions.length} active`,
      locked: false,
    },
    {
      id: 'questions',
      group: 'Prepare',
      label: '4. Lab questions',
      meta: String(data.questions.length),
      locked: !prepareReady,
    },
    {
      id: 'banks',
      group: 'Prepare',
      label: '5. Pre/post banks',
      meta: `${activeCount}/${data.sessions.length}`,
      locked: !prepareReady,
    },
    { id: 'sessions', group: 'Run', label: '6. Sessions', meta: String(data.sessions.length), locked: !prepareReady },
    { id: 'classroom', group: 'Run', label: '7. Classroom', meta: 'Weeks', locked: false },
    { id: 'assessments', group: 'Run', label: '8. Assessments', meta: 'End-sem', locked: false },
    { id: 'reports', group: 'Complete', label: '9. Reports', meta: 'Course file', locked: false },
  ];

  return (
    <FacultyShell
      course={data.course}
      activeStep={step}
      steps={steps}
      aiUsage={data.aiUsage}
      sessions={data.sessions}
      coCount={data.outcomes.length}
      batchCount={data.batches.length}
    >
      {step === 'setup' ? (
        <CourseSetupStep
          course={data.course}
          outcomes={data.outcomes}
          coPoMap={data.coPoMap}
          onReload={reload}
        />
      ) : step === 'batches' ? (
        <BatchesStep
          course={data.course}
          batches={data.batches}
          enrollments={data.enrollments}
          pending={data.pending}
          sessions={data.sessions}
          onReload={reload}
        />
      ) : step === 'sessions-plan' ? (
        <SessionPlanStep
          course={data.course}
          sessions={data.sessions}
          holidays={data.holidays}
          onReload={reload}
          onGoQuestions={() => navigate(`/faculty/c/${data.course.id}/questions`)}
        />
      ) : step === 'questions' ? (
        <LabQuestionsStep
          course={data.course}
          sessions={data.sessions}
          questions={data.questions}
          sessionQuestions={data.sessionQuestions}
          onReload={reload}
        />
      ) : step === 'banks' ? (
        <BanksStep
          course={data.course}
          sessions={data.sessions}
          bankItems={data.bankItems}
          onReload={reload}
        />
      ) : step === 'sessions' ? (
        <SessionsStep
          course={data.course}
          batches={data.batches}
          enrollments={data.enrollments}
          sessions={data.sessions}
        />
      ) : step === 'classroom' ? (
        <ClassroomStep
          course={data.course}
          batches={data.batches}
          pending={data.pending}
          sessions={data.sessions}
          enrolledCount={data.enrollments.length}
        />
      ) : step === 'reports' ? (
        <ReportsStep
          course={data.course}
          outcomes={data.outcomes}
          sessions={data.sessions}
          enrollments={data.enrollments}
          onReload={reload}
        />
      ) : step === 'assessments' ? (
        <AssessmentsStep
          course={data.course}
          batches={data.batches}
          outcomes={data.outcomes}
          enrollments={data.enrollments}
        />
      ) : (
        <Card title="Coming in next phase">
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            This step unlocks in the next build phase.
          </p>
        </Card>
      )}
    </FacultyShell>
  );
}
