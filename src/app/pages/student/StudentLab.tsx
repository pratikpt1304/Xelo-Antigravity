import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Banner, Card, Chip, ErrorNote, Loading } from '../../../components/ui';
import { Workbench, type WorkbenchQuestion } from '../../../components/Workbench';
import { useLoad } from '../../../lib/hooks';
import type { JudgeSummary } from '../../../lib/logic/judge';
import type { CodeLang } from '../../../lib/logic/starters';
import { useSession } from '../../../lib/session';
import { fn, must, rpc, supabase } from '../../../lib/supabase';
import type {
  Course,
  NotificationRow,
  QuestionRow,
  SessionQuestionRow,
  SessionRow,
  SubmissionRow,
  TestAttemptRow,
} from '../../../lib/types';
import { StudentShell } from './StudentShell';

export function StudentLab() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { profile } = useSession();
  const navigate = useNavigate();
  const [liveHint, setLiveHint] = useState<string | null>(null);
  const [postUnlocked, setPostUnlocked] = useState(false);

  const { data, loading, error } = useLoad(async () => {
    if (!sessionId) throw new Error('not_found');
    await rpc('lab_checkin', { p_session_id: sessionId }).catch(() => null);

    const [sessRes, sqRes, qRes, tcRes, draftRes, attRes, subRes, notifRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('session_questions').select('*').eq('session_id', sessionId).order('slot'),
      supabase.from('questions').select('*').eq('session_id', sessionId),
      supabase.from('test_cases').select('question_id, ord, input, expected, hidden').eq('hidden', false),
      supabase.from('drafts').select('question_id, lang, code').eq('context', 'lab'),
      supabase.from('test_attempts').select('*').eq('session_id', sessionId),
      supabase.from('submissions').select('*').eq('session_id', sessionId),
      supabase.from('notifications').select('*').eq('kind', 'hint').order('created_at', { ascending: false }).limit(1),
    ]);

    const sess = must(sessRes) as SessionRow;
    const courseRes = await supabase.from('courses').select('*').eq('id', sess.course_id).single();
    const sqs = must(sqRes) as SessionQuestionRow[];
    const qIds = sqs.map((s) => s.question_id);
    const hiddenCounts = qIds.length
      ? await rpc<Array<{ question_id: string; hidden_count: number }>>('hidden_test_counts', {
          p_question_ids: qIds,
        }).catch(() => [])
      : [];

    return {
      session: sess,
      course: must(courseRes) as Course,
      sqs,
      questions: must(qRes) as QuestionRow[],
      visibleTests: (tcRes.data ?? []) as Array<{
        question_id: string;
        ord: number;
        input: string;
        expected: string;
      }>,
      hiddenCounts,
      drafts: (draftRes.data ?? []) as Array<{ question_id: string; lang: string; code: string }>,
      attempts: (attRes.data ?? []) as TestAttemptRow[],
      submissions: (subRes.data ?? []) as SubmissionRow[],
      hints: (notifRes.data ?? []) as NotificationRow[],
    };
  }, [sessionId]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`stu-hints-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          if (row.kind === 'hint') setLiveHint(row.body);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [profile]);

  if (loading) return <StudentShell><Loading /></StudentShell>;
  if (error || !data) return <StudentShell><ErrorNote message={error ?? 'Lab not found'} /></StudentShell>;

  const initialCodes: Record<string, string> = {};
  for (const d of data.drafts) {
    initialCodes[`${d.question_id}:${d.lang}`] = d.code;
  }

  const wbQuestions: WorkbenchQuestion[] = data.sqs
    .map((sq) => data.questions.find((q) => q.id === sq.question_id))
    .filter((q): q is QuestionRow => Boolean(q))
    .map((q) => ({
      id: q.id,
      title: q.title,
      co_code: q.co_code,
      difficulty: q.difficulty,
      statement: q.statement,
      input_spec: q.input_spec,
      output_spec: q.output_spec,
      constraints: q.constraints,
      visibleTests: data.visibleTests
        .filter((t) => t.question_id === q.id)
        .sort((a, b) => a.ord - b.ord),
      hiddenCount: data.hiddenCounts.find((h) => h.question_id === q.id)?.hidden_count ?? 3,
    }));

  const preAttempt = data.attempts.find((a) => a.bank === 'pre');
  const allHiddenPassed =
    postUnlocked ||
    (wbQuestions.length > 0 &&
      wbQuestions.every((q) =>
        data.submissions.some(
          (s) => s.question_id === q.id && s.hidden_total > 0 && s.hidden_passed === s.hidden_total,
        ),
      ));

  const handleRun = async (
    qId: string,
    lang: CodeLang,
    code: string,
    mode: 'run' | 'submit',
  ): Promise<JudgeSummary> => {
    const res = await fn<JudgeSummary>('run-code', {
      question_id: qId,
      lang,
      code,
      mode,
      context: 'lab',
    });
    if (mode === 'submit' && res.hiddenTotal > 0 && res.hiddenPassed === res.hiddenTotal) {
      setPostUnlocked(true);
    }
    return res;
  };

  const handleSaveDraft = async (qId: string, lang: CodeLang, code: string) => {
    if (!profile) return;
    await supabase.from('drafts').upsert(
      {
        student_id: profile.id,
        question_id: qId,
        context: 'lab',
        lang,
        code,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,question_id,context,lang' },
    );
  };

  const activeHint = liveHint ?? data.hints[0]?.body ?? null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {activeHint ? (
        <div style={{ padding: '8px 16px', background: 'var(--assist-tint)' }}>
          <Banner tone="info">
            <strong>Hint from faculty:</strong> {activeHint}
          </Banner>
        </div>
      ) : null}

      <Workbench
        title={`${data.course.code} · S${data.session.n}`}
        questions={wbQuestions}
        allowedLangs={data.course.allowed_langs as CodeLang[]}
        initialCodes={initialCodes}
        statusChips={
          <>
            <Chip tone="neutral">
              {preAttempt?.submitted_at ? `Pre ${preAttempt.score}/5` : 'Pre-test'}
            </Chip>
            <Chip tone={allHiddenPassed ? 'good' : 'neutral'}>
              {allHiddenPassed ? 'Post-test unlocked' : 'Post-test locked'}
            </Chip>
          </>
        }
        postTestCard={
          <Card title="Post-test">
            {allHiddenPassed ? (
              <Link className="xe-btn xe-btn--primary" to={`/student/test/${data.session.id}/post`}>
                Take post-test
              </Link>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Pass all hidden tests of both questions to unlock (closes 23:59).
              </span>
            )}
          </Card>
        }
        onRun={handleRun}
        onSaveDraft={handleSaveDraft}
        onExit={() => navigate('/student')}
      />
    </div>
  );
}
