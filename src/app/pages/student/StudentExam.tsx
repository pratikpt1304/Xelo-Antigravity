import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Workbench, type WorkbenchQuestion } from '../../../components/Workbench';
import { Banner, Chip, ErrorNote, Loading } from '../../../components/ui';
import { useAction, useLoad } from '../../../lib/hooks';
import type { JudgeSummary } from '../../../lib/logic/judge';
import type { CodeLang } from '../../../lib/logic/starters';
import {
  attachExamLockdown,
  captureSnapshot,
  getActiveStreams,
  initFaceDetector,
  stopAllStreams,
  type ProctorViolationKind,
} from '../../../lib/proctor-runtime';
import { useSession } from '../../../lib/session';
import { fn, must, rpc, supabase } from '../../../lib/supabase';
import type { QuestionRow } from '../../../lib/types';

interface ExamAssessmentRow {
  id: string;
  course_id: string;
  stage: string;
  rules: { langs?: CodeLang[] };
}

interface ExamPaperRow {
  id: string;
  assessment_id: string;
  student_id: string;
  question_ids: string[];
  started_at: string | null;
  deadline: string | null;
  submitted_at: string | null;
  extra_minutes: number;
  warnings: number;
  flagged: boolean;
  status: string;
}

interface VisibleTestRow {
  question_id: string;
  ord: number;
  input: string;
  expected: string;
}

interface DraftItemRow {
  question_id: string;
  lang: string;
  code: string;
}

export function StudentExam() {
  const { assessmentId = '' } = useParams();
  const { profile } = useSession();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const autoSubmittedRef = useRef(false);

  const [liveWarnings, setLiveWarnings] = useState<number | null>(null);
  const [liveFlagged, setLiveFlagged] = useState<boolean | null>(null);
  const [lastAlert, setLastAlert] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);

  const { data, loading, error, reload } = useLoad(async () => {
    if (!assessmentId) return null;
    const [assRes, paperRes] = await Promise.all([
      supabase.from('assessments').select('*').eq('id', assessmentId).single(),
      supabase.from('exam_papers').select('*').eq('assessment_id', assessmentId).single(),
    ]);
    const assessment = must(assRes) as ExamAssessmentRow;
    const paper = must(paperRes) as ExamPaperRow;

    const qIds = paper.question_ids ?? [];
    const [qRes, tcRes, dRes] = await Promise.all([
      qIds.length ? supabase.from('questions').select('*').in('id', qIds) : Promise.resolve({ data: [], error: null }),
      qIds.length
        ? supabase.from('test_cases').select('question_id, ord, input, expected').in('question_id', qIds).order('ord')
        : Promise.resolve({ data: [], error: null }),
      supabase.from('drafts').select('question_id, lang, code').eq('course_id', assessment.course_id),
    ]);

    return {
      assessment,
      paper,
      questions: (qRes.data ?? []) as QuestionRow[],
      testCases: (tcRes.data ?? []) as VisibleTestRow[],
      drafts: (dRes.data ?? []) as DraftItemRow[],
    };
  }, [assessmentId]);

  const paper = data?.paper ?? null;
  const warnings = liveWarnings ?? paper?.warnings ?? 0;
  const flagged = liveFlagged ?? paper?.flagged ?? false;

  const logViolation = useCallback(
    async (kind: ProctorViolationKind) => {
      if (!paper || paper.status !== 'started') return;
      let snapshotPath: string | null = null;
      if (videoRef.current && profile) {
        const blob = await captureSnapshot(videoRef.current);
        if (blob) {
          const path = `${paper.id}/${Date.now()}-${kind}.jpg`;
          const up = await supabase.storage.from('proctor').upload(path, blob, { contentType: 'image/jpeg' });
          if (!up.error) snapshotPath = path;
        }
      }
      const res = await rpc<{ warnings: number; flagged: boolean }>('log_proctor_event', {
        p_paper_id: paper.id,
        p_kind: kind,
        p_snapshot_path: snapshotPath,
      }).catch(() => null);
      if (res) {
        setLiveWarnings(res.warnings);
        setLiveFlagged(res.flagged);
      }
      setLastAlert(`Proctor alert recorded: ${kind.replace('_', ' ')}`);
    },
    [paper, profile],
  );

  useEffect(() => {
    if (!paper || paper.status !== 'started') return;
    const detach = attachExamLockdown({ onViolation: (kind) => void logViolation(kind) });
    return () => detach();
  }, [paper, logViolation]);

  useEffect(() => {
    const stream = getActiveStreams().camera;
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [paper?.id]);

  useEffect(() => {
    if (!paper || paper.status !== 'started') return;
    let active = true;
    let timerId: number | undefined;

    void initFaceDetector().then((detector) => {
      if (!active || !detector) return;
      timerId = window.setInterval(() => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        const result = detector.detectForVideo(videoRef.current, performance.now());
        const count = result.detections.length;
        if (count === 0) void logViolation('no_face');
        else if (count > 1) void logViolation('multiple_faces');
      }, 5000);
    });

    return () => {
      active = false;
      if (timerId) window.clearInterval(timerId);
    };
  }, [paper, logViolation]);

  const submitAction = useAction(async () => {
    if (!paper) return;
    await rpc('submit_exam', { p_paper_id: paper.id });
    stopAllStreams();
    navigate('/student/endsem');
  });

  useEffect(() => {
    if (!paper?.deadline || paper.status !== 'started') return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(paper.deadline!).getTime() - Date.now()) / 1000));
      setRemainingSec(diff);
      if (diff === 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        void submitAction.run();
      }
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [paper?.deadline, paper?.status, submitAction]);

  const workbenchQuestions = useMemo<WorkbenchQuestion[]>(() => {
    return (data?.questions ?? []).map((q) => ({
      id: q.id,
      title: q.title,
      co_code: q.co_code,
      difficulty: q.difficulty,
      statement: q.statement,
      input_spec: q.input_spec,
      output_spec: q.output_spec,
      constraints: q.constraints,
      visibleTests: (data?.testCases ?? [])
        .filter((tc) => tc.question_id === q.id)
        .map((tc) => ({ ord: tc.ord, input: tc.input, expected: tc.expected })),
      hiddenCount: 3,
    }));
  }, [data?.questions, data?.testCases]);

  const initialCodes = useMemo(() => {
    const out: Record<string, string> = {};
    for (const d of data?.drafts ?? []) {
      out[`${d.question_id}:${d.lang}`] = d.code;
    }
    return out;
  }, [data?.drafts]);

  if (loading && !data) return <Loading label="Loading proctored exam..." />;
  if (error) return <ErrorNote message={error} />;
  if (!data || !paper) return <ErrorNote message="Assessment paper not found." />;

  const mins = remainingSec !== null ? Math.floor(remainingSec / 60) : 0;
  const secs = remainingSec !== null ? remainingSec % 60 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong>End-sem practical</strong>
          <Chip tone={flagged ? 'bad' : warnings > 0 ? 'warn' : 'good'}>
            Warnings: {warnings}/3 {flagged ? '· Flagged for review' : ''}
          </Chip>
          {remainingSec !== null ? (
            <Chip tone={remainingSec < 300 ? 'warn' : 'neutral'}>
              Time left: {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </Chip>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ width: 64, height: 48, borderRadius: 6, background: '#111', objectFit: 'cover' }}
          />
          <button
            type="button"
            className="xe-btn xe-btn-primary"
            disabled={submitAction.busy}
            onClick={() => submitAction.run()}
          >
            {submitAction.busy ? 'Submitting...' : 'Submit exam'}
          </button>
        </div>
      </div>

      {lastAlert ? (
        <div style={{ padding: '6px 16px' }}>
          <Banner tone={flagged ? 'err' : 'info'}>{lastAlert}</Banner>
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0 }}>
        <Workbench
          title="Proctored exam"
          questions={workbenchQuestions}
          allowedLangs={data.assessment.rules.langs ?? ['c', 'cpp', 'python', 'java']}
          initialCodes={initialCodes}
          onRun={async (questionId, lang, code, submit) => {
            const res = await fn<JudgeSummary>('run-code', {
              context: 'endsem',
              paper_id: paper.id,
              question_id: questionId,
              lang,
              code,
              submit,
            });
            await reload();
            return res;
          }}
          onSaveDraft={async (questionId, lang, code) => {
            if (!profile) return;
            await supabase.from('drafts').upsert(
              {
                student_id: profile.id,
                course_id: data.assessment.course_id,
                question_id: questionId,
                lang,
                code,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'student_id,question_id,lang' },
            );
          }}
          onExit={() => navigate('/student/endsem')}
        />
      </div>
    </div>
  );
}
