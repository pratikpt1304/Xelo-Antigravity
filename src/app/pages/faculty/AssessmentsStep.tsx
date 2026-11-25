import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banner,
  Card,
  Chip,
  Empty,
  ErrorNote,
  Kpis,
  Loading,
  Stepper,
  statusTone,
} from '../../../components/ui';
import { formatIstDateTime, todayIso } from '../../../lib/format';
import { useAction, useLoad } from '../../../lib/hooks';
import { examPaperMarks, validateExamRules } from '../../../lib/logic/proctor';
import type { CodeLang } from '../../../lib/logic/starters';
import { fn, must, rpc, supabase } from '../../../lib/supabase';
import type {
  AttendanceRow,
  BatchRow,
  Course,
  CourseOutcome,
  EnrollmentRow,
  Profile,
  QuestionRow,
} from '../../../lib/types';

interface AssessmentRow {
  id: string;
  course_id: string;
  batch_id: string;
  rules: {
    mix?: { easy: number; medium: number; hard: number };
    langs?: CodeLang[];
    questions_per_student?: number;
    duration_min?: number;
    test_marks?: number;
    viva_marks?: number;
    proctoring?: {
      face_detect?: boolean;
      screen_share?: boolean;
      fullscreen?: boolean;
      copy_paste_block?: boolean;
    };
  };
  hod_status: string;
  hod_remark: string | null;
  exam_date: string | null;
  start_at: string | null;
  end_at: string | null;
  room: string | null;
  stage: string;
  added_to_file: boolean;
}

interface AssessmentQuestionRow {
  assessment_id: string;
  question_id: string;
  approved: boolean;
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

interface ProctorEventRow {
  id: string;
  paper_id: string;
  kind: string;
  snapshot_path: string | null;
  reviewed: boolean;
  review_note: string | null;
  created_at: string;
}

const STAGES = [
  { id: 'rules', label: '1. Rules' },
  { id: 'questions', label: '2. Approve 30' },
  { id: 'hod', label: '3. HOD approval' },
  { id: 'schedule', label: '4. Schedule' },
  { id: 'conduct', label: '5. Conduct' },
  { id: 'marks', label: '6. Marks' },
];

export function AssessmentsStep({
  course,
  batches,
  outcomes,
  enrollments,
}: {
  course: Course;
  batches: BatchRow[];
  outcomes: CourseOutcome[];
  enrollments: EnrollmentRow[];
}) {
  const [batchId, setBatchId] = useState(batches[0]?.id ?? '');
  const [stageIdx, setStageIdx] = useState(0);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [easy, setEasy] = useState(12);
  const [medium, setMedium] = useState(18);
  const [hard, setHard] = useState(10);
  const [durationMin, setDurationMin] = useState(120);
  const [room, setRoom] = useState('Lab 204');
  const [examDate, setExamDate] = useState(todayIso());
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('12:00');
  const [presentMap, setPresentMap] = useState<Record<string, boolean>>({});
  const [vivaDraft, setVivaDraft] = useState<Record<string, number>>({});

  const activeBatchId = batchId || batches[0]?.id || '';

  const loader = useCallback(async () => {
    if (!activeBatchId) return null;
    const [assRes, qRes, attRes, profRes] = await Promise.all([
      supabase
        .from('assessments')
        .select('*')
        .eq('course_id', course.id)
        .eq('batch_id', activeBatchId)
        .maybeSingle(),
      supabase.from('questions').select('*').eq('course_id', course.id).eq('kind', 'endsem'),
      supabase.from('attendance').select('*').eq('course_id', course.id),
      supabase.from('profiles').select('id, full_name, roll_no'),
    ]);

    const assessment = assRes.data as AssessmentRow | null;
    let aqRows: AssessmentQuestionRow[] = [];
    let papers: ExamPaperRow[] = [];
    let events: ProctorEventRow[] = [];

    if (assessment) {
      const [aqRes, pRes] = await Promise.all([
        supabase.from('assessment_questions').select('*').eq('assessment_id', assessment.id),
        supabase.from('exam_papers').select('*').eq('assessment_id', assessment.id),
      ]);
      aqRows = (aqRes.data ?? []) as AssessmentQuestionRow[];
      papers = (pRes.data ?? []) as ExamPaperRow[];
      if (papers.length > 0) {
        const evRes = await supabase
          .from('proctor_events')
          .select('*')
          .in(
            'paper_id',
            papers.map((p) => p.id),
          )
          .order('created_at', { ascending: false });
        events = (evRes.data ?? []) as ProctorEventRow[];
      }
    }

    return {
      assessment,
      questions: must(qRes) as QuestionRow[],
      aqRows,
      papers,
      events,
      attendance: must(attRes) as Array<AttendanceRow & { assessment_id?: string | null; status?: string }>,
      profiles: (profRes.data ?? []) as Pick<Profile, 'id' | 'full_name' | 'roll_no'>[],
    };
  }, [activeBatchId, course.id]);

  const { data, loading, error, reload } = useLoad(loader, [activeBatchId, course.id]);

  const assessment = data?.assessment ?? null;

  useEffect(() => {
    if (!assessment || assessment.stage !== 'active') return;
    const t = window.setInterval(() => reload(), 10000);
    return () => window.clearInterval(t);
  }, [assessment, reload]);

  const batchStudents = useMemo(
    () => enrollments.filter((e) => e.batch_id === activeBatchId),
    [enrollments, activeBatchId],
  );

  const profMap = useMemo(
    () => new Map((data?.profiles ?? []).map((p) => [p.id, p])),
    [data?.profiles],
  );

  const aqMap = useMemo(
    () => new Map((data?.aqRows ?? []).map((r) => [r.question_id, r.approved])),
    [data?.aqRows],
  );

  const linkedQuestions = useMemo(
    () => (data?.questions ?? []).filter((q) => aqMap.has(q.id)),
    [data?.questions, aqMap],
  );

  const approvedQuestions = useMemo(
    () => linkedQuestions.filter((q) => aqMap.get(q.id)),
    [linkedQuestions, aqMap],
  );

  const coCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of outcomes) counts[o.code] = 0;
    for (const q of approvedQuestions) {
      counts[q.co_code] = (counts[q.co_code] ?? 0) + 1;
    }
    return counts;
  }, [outcomes, approvedQuestions]);

  const createRulesAction = useAction(async () => {
    const errText = validateExamRules({
      questions_per_student: 2,
      mix: { easy, medium, hard },
      visible_count: 2,
      hidden_count: 3,
      marks_per_test: 5,
      viva: 10,
      duration_min: durationMin,
    });
    if (errText) throw new Error(errText);
    await rpc('create_assessment', {
      p_course_id: course.id,
      p_batch_id: activeBatchId,
      p_rules: {
        mix: { easy, medium, hard },
        langs: ['c', 'cpp', 'python', 'java'],
        questions_per_student: 2,
        duration_min: durationMin,
        test_marks: 5,
        viva_marks: 10,
        proctoring: {
          face_detect: true,
          screen_share: true,
          fullscreen: true,
          copy_paste_block: true,
        },
      },
    });
  });

  const generate40Action = useAction(async () => {
    if (!assessment) return;
    await fn('ai-generate', {
      kind: 'endsem_set',
      course_id: course.id,
      assessment_id: assessment.id,
      mix: { easy, medium, hard },
      co_codes: outcomes.map((o) => o.code),
    });
  });

  const toggleApproveAction = useAction(async (questionId: string, nextApproved: boolean) => {
    if (!assessment) return;
    const res = await supabase
      .from('assessment_questions')
      .update({ approved: nextApproved })
      .eq('assessment_id', assessment.id)
      .eq('question_id', questionId);
    must(res);
  });

  const sendHodAction = useAction(async () => {
    if (!assessment) return;
    await rpc('send_assessment_to_hod', { p_assessment_id: assessment.id });
  });

  const scheduleAction = useAction(async () => {
    if (!assessment) return;
    const startAt = `${examDate}T${startTime}:00+05:30`;
    const endAt = `${examDate}T${endTime}:00+05:30`;
    await rpc('schedule_assessment', {
      p_assessment_id: assessment.id,
      p_date: examDate,
      p_start_at: startAt,
      p_end_at: endAt,
      p_room: room.trim(),
    });
  });

  const saveAttendanceAction = useAction(async () => {
    if (!assessment) return;
    const records = batchStudents.map((s) => ({
      student_id: s.student_id,
      present: presentMap[s.student_id] ?? true,
    }));
    await rpc('save_exam_attendance', {
      p_assessment_id: assessment.id,
      p_records: records,
    });
  });

  const activateAction = useAction(async () => {
    if (!assessment) return;
    await rpc('activate_assessment', { p_assessment_id: assessment.id });
  });

  const extraTimeAction = useAction(async (paperId: string) => {
    await rpc('grant_extra_time', { p_paper_id: paperId, p_minutes: 10 });
  });

  const endAssessmentAction = useAction(async () => {
    if (!assessment) return;
    await rpc('end_assessment', { p_assessment_id: assessment.id });
  });

  const reviewFlagAction = useAction(async (eventId: string) => {
    await rpc('review_proctor_event', {
      p_event_id: eventId,
      p_note: 'Reviewed by faculty',
    });
  });

  const addToFileAction = useAction(async () => {
    if (!assessment) return;
    await rpc('add_assessment_to_file', { p_assessment_id: assessment.id });
  });

  if (batches.length === 0) {
    return <Empty message="Create batches in the Roster step before setting up end-sem exams." />;
  }

  const actionMessage =
    createRulesAction.message ||
    generate40Action.message ||
    toggleApproveAction.message ||
    sendHodAction.message ||
    scheduleAction.message ||
    saveAttendanceAction.message ||
    activateAction.message ||
    extraTimeAction.message ||
    endAssessmentAction.message ||
    reviewFlagAction.message ||
    addToFileAction.message;

  const papers = data?.papers ?? [];
  const events = data?.events ?? [];
  const unreviewedCount = events.filter((e) => !e.reviewed).length;
  const examAttMap = new Map(
    (data?.attendance ?? [])
      .filter((a) => a.assessment_id === assessment?.id)
      .map((a) => [a.student_id, a.status ? a.status === 'present' : true]),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="End-semester practical"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Batch:</span>
            {batches.map((b) => (
              <button
                key={b.id}
                type="button"
                className={activeBatchId === b.id ? 'xe-btn xe-btn-primary' : 'xe-btn xe-btn-secondary'}
                onClick={() => {
                  setBatchId(b.id);
                  setBanner(null);
                }}
              >
                {b.name}
              </button>
            ))}
          </div>
        }
      >
        <Stepper
          steps={STAGES.map((s) => ({
            id: s.id,
            label: s.label,
          }))}
          activeId={STAGES[stageIdx]?.id ?? 'rules'}
          onSelect={(id) => {
            const idx = STAGES.findIndex((s) => s.id === id);
            if (idx >= 0) setStageIdx(idx);
          }}
        />
      </Card>

      {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
      {actionMessage?.tone === 'err' ? <ErrorNote message={actionMessage.text} /> : null}
      {loading && !data ? <Loading label="Loading assessment..." /> : null}
      {error ? <ErrorNote message={error} /> : null}

      {stageIdx === 0 ? (
        <Card title="Stage 1 · Rules & difficulty mix (40 questions)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 12 }}>
            <label className="xe-field">
              <span>Easy</span>
              <input type="number" min={0} max={40} value={easy} onChange={(e) => setEasy(Number(e.target.value))} />
            </label>
            <label className="xe-field">
              <span>Medium</span>
              <input
                type="number"
                min={0}
                max={40}
                value={medium}
                onChange={(e) => setMedium(Number(e.target.value))}
              />
            </label>
            <label className="xe-field">
              <span>Hard</span>
              <input type="number" min={0} max={40} value={hard} onChange={(e) => setHard(Number(e.target.value))} />
            </label>
            <label className="xe-field">
              <span>Duration (min)</span>
              <input
                type="number"
                min={30}
                max={240}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
              />
            </label>
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
            Defaults: 2 questions per student · 2 visible + 3 hidden tests (5 marks each) · Viva 10 · Total 60 · Face
            detection + screen share + fullscreen + copy/paste lock enabled.
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="xe-btn xe-btn-primary"
              disabled={createRulesAction.busy}
              onClick={async () => {
                await createRulesAction.run();
                setBanner({ tone: 'ok', text: 'Rules saved. Proceed to Stage 2 to generate and approve 30 questions.' });
                await reload();
                setStageIdx(1);
              }}
            >
              {createRulesAction.busy ? 'Saving...' : 'Save rules & create set'}
            </button>
            {assessment ? <Chip tone="good">Stage: {assessment.stage}</Chip> : null}
          </div>
        </Card>
      ) : null}

      {stageIdx === 1 ? (
        <Card
          title={`Stage 2 · Generate 40 & approve 30 (${approvedQuestions.length}/30 approved)`}
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="xe-btn xe-btn-assist"
                disabled={!assessment || generate40Action.busy}
                onClick={async () => {
                  await generate40Action.run();
                  setBanner({ tone: 'ok', text: 'Assist generated 40 end-sem questions.' });
                  await reload();
                }}
              >
                {generate40Action.busy ? 'Generating...' : 'Generate 40 with Assist (1 credit)'}
              </button>
              <button
                type="button"
                className="xe-btn xe-btn-primary"
                disabled={!assessment || sendHodAction.busy}
                onClick={async () => {
                  await sendHodAction.run();
                  setBanner({ tone: 'ok', text: 'Sent 30 approved questions to HOD.' });
                  await reload();
                  setStageIdx(2);
                }}
              >
                Send 30 to HOD
              </button>
            </div>
          }
        >
          {!assessment ? (
            <Empty message="Save rules in Stage 1 first." />
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {Object.entries(coCounts).map(([code, cnt]) => (
                  <Chip key={code} tone={cnt >= 4 ? 'good' : 'warn'}>
                    {code}: {cnt}/4 min
                  </Chip>
                ))}
              </div>
              {linkedQuestions.length === 0 ? (
                <Empty message="No end-sem questions generated yet. Click Generate 40 with Assist." />
              ) : (
                <div className="xe-table-wrap">
                  <table className="xe-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Title</th>
                        <th>CO</th>
                        <th>Difficulty</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedQuestions.map((q, idx) => {
                        const isApp = aqMap.get(q.id) ?? false;
                        return (
                          <tr key={q.id}>
                            <td className="xe-mono">{idx + 1}</td>
                            <td>{q.title}</td>
                            <td className="xe-mono">{q.co_code}</td>
                            <td>
                              <Chip tone="neutral">{q.difficulty}</Chip>
                            </td>
                            <td>
                              <Chip tone={isApp ? 'good' : 'neutral'}>{isApp ? 'Approved' : 'Candidate'}</Chip>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={isApp ? 'xe-btn xe-btn-secondary' : 'xe-btn xe-btn-primary'}
                                disabled={toggleApproveAction.busy}
                                onClick={async () => {
                                  await toggleApproveAction.run(q.id, !isApp);
                                  await reload();
                                }}
                              >
                                {isApp ? 'Unapprove' : 'Approve'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>
      ) : null}

      {stageIdx === 2 ? (
        <Card title="Stage 3 · HOD approval">
          {!assessment ? (
            <Empty message="Create assessment rules in Stage 1 first." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span>HOD status:</span>
                <Chip tone={statusTone(assessment.hod_status)}>{assessment.hod_status}</Chip>
              </div>
              {assessment.hod_remark ? (
                <Banner tone={assessment.hod_status === 'declined' ? 'err' : 'info'}>
                  HOD remark: {assessment.hod_remark}
                </Banner>
              ) : null}
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Scheduling in Stage 4 unlocks once the HOD approves the 30-question set.
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {stageIdx === 3 ? (
        <Card title="Stage 4 · Schedule">
          {!assessment ? (
            <Empty message="Create assessment first." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: 12 }}>
                <label className="xe-field">
                  <span>Exam date</span>
                  <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
                </label>
                <label className="xe-field">
                  <span>Start time (IST)</span>
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </label>
                <label className="xe-field">
                  <span>End time (IST)</span>
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </label>
                <label className="xe-field">
                  <span>Room</span>
                  <input type="text" value={room} onChange={(e) => setRoom(e.target.value)} />
                </label>
              </div>
              <div>
                <button
                  type="button"
                  className="xe-btn xe-btn-primary"
                  disabled={scheduleAction.busy}
                  onClick={async () => {
                    await scheduleAction.run();
                    setBanner({ tone: 'ok', text: `Scheduled for ${examDate} in ${room}.` });
                    await reload();
                    setStageIdx(4);
                  }}
                >
                  {scheduleAction.busy ? 'Scheduling...' : 'Schedule exam'}
                </button>
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {stageIdx === 4 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card
            title="Stage 5 · Exam attendance & activation"
            actions={
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="xe-btn xe-btn-secondary"
                  disabled={!assessment || saveAttendanceAction.busy}
                  onClick={async () => {
                    await saveAttendanceAction.run();
                    setBanner({ tone: 'ok', text: 'Exam attendance saved.' });
                    await reload();
                  }}
                >
                  Save attendance
                </button>
                <button
                  type="button"
                  className="xe-btn xe-btn-primary"
                  disabled={!assessment || activateAction.busy}
                  onClick={async () => {
                    await activateAction.run();
                    setBanner({ tone: 'ok', text: 'Exam activated for present students.' });
                    await reload();
                  }}
                >
                  Activate exam
                </button>
                <button
                  type="button"
                  className="xe-btn xe-btn-secondary"
                  disabled={!assessment || endAssessmentAction.busy}
                  onClick={async () => {
                    await endAssessmentAction.run();
                    setBanner({ tone: 'ok', text: 'Exam ended and unsubmitted papers auto-submitted.' });
                    await reload();
                  }}
                >
                  End exam
                </button>
              </div>
            }
          >
            {batchStudents.length === 0 ? (
              <Empty message="No students enrolled in this batch." />
            ) : (
              <div className="xe-table-wrap">
                <table className="xe-table">
                  <thead>
                    <tr>
                      <th>Roll</th>
                      <th>Student</th>
                      <th>Present</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchStudents.map((s) => {
                      const prof = profMap.get(s.student_id);
                      const checked = presentMap[s.student_id] ?? examAttMap.get(s.student_id) ?? true;
                      return (
                        <tr key={s.student_id}>
                          <td className="xe-mono">{prof?.roll_no ?? '—'}</td>
                          <td>{prof?.full_name ?? s.student_id}</td>
                          <td>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setPresentMap((prev) => ({ ...prev, [s.student_id]: e.target.checked }))
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Live proctor monitor" noPadding>
            {papers.length === 0 ? (
              <div style={{ padding: 16 }}>
                <Empty message="No student papers started yet." />
              </div>
            ) : (
              <div className="xe-table-wrap">
                <table className="xe-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Status</th>
                      <th>Deadline</th>
                      <th>Warnings</th>
                      <th>Extra</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {papers.map((p) => {
                      const prof = profMap.get(p.student_id);
                      return (
                        <tr key={p.id}>
                          <td>{prof?.full_name ?? p.student_id}</td>
                          <td>
                            <Chip tone={p.flagged ? 'bad' : statusTone(p.status)}>{p.status}</Chip>
                          </td>
                          <td className="xe-mono">{p.deadline ? formatIstDateTime(p.deadline) : '—'}</td>
                          <td className="xe-mono">
                            {p.warnings} {p.flagged ? '(Flagged)' : ''}
                          </td>
                          <td className="xe-mono">+{p.extra_minutes}m</td>
                          <td>
                            <button
                              type="button"
                              className="xe-btn xe-btn-secondary"
                              disabled={extraTimeAction.busy}
                              onClick={async () => {
                                await extraTimeAction.run(p.id);
                                setBanner({ tone: 'ok', text: `Granted +10 min to ${prof?.full_name ?? 'student'}.` });
                                await reload();
                              }}
                            >
                              +10 min
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {stageIdx === 5 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Kpis
            items={[
              { label: 'Papers', value: String(papers.length) },
              { label: 'Flagged', value: String(papers.filter((p) => p.flagged).length) },
              { label: 'Unreviewed events', value: String(unreviewedCount) },
              { label: 'Course file', value: assessment?.added_to_file ? 'Added' : 'Pending' },
            ]}
          />

          <Card title="Stage 6 · Proctor flags review" noPadding>
            {events.length === 0 ? (
              <div style={{ padding: 16 }}>
                <Empty message="No proctor events recorded." />
              </div>
            ) : (
              <div className="xe-table-wrap">
                <table className="xe-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Event</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => (
                      <tr key={ev.id}>
                        <td className="xe-mono">{formatIstDateTime(ev.created_at)}</td>
                        <td className="xe-mono">{ev.kind}</td>
                        <td>
                          <Chip tone={ev.reviewed ? 'good' : 'warn'}>{ev.reviewed ? 'Reviewed' : 'Pending'}</Chip>
                        </td>
                        <td>
                          {!ev.reviewed ? (
                            <button
                              type="button"
                              className="xe-btn xe-btn-secondary"
                              disabled={reviewFlagAction.busy}
                              onClick={async () => {
                                await reviewFlagAction.run(ev.id);
                                await reload();
                              }}
                            >
                              Mark reviewed
                            </button>
                          ) : (
                            <span className="xe-mono" style={{ fontSize: 12 }}>
                              {ev.review_note ?? 'Reviewed'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            title="Marks (/60) & course file"
            actions={
              <button
                type="button"
                className="xe-btn xe-btn-primary"
                disabled={!assessment || addToFileAction.busy || assessment.added_to_file}
                onClick={async () => {
                  await addToFileAction.run();
                  setBanner({ tone: 'ok', text: 'End-sem marks added to course file.' });
                  await reload();
                }}
              >
                {assessment?.added_to_file ? 'Added to course file' : 'Add to course file'}
              </button>
            }
          >
            {papers.length === 0 ? (
              <Empty message="No exam papers to grade yet." />
            ) : (
              <div className="xe-table-wrap">
                <table className="xe-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Max code (/50)</th>
                      <th>Viva (/10)</th>
                      <th>Max total (/60)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {papers.map((p) => {
                      const prof = profMap.get(p.student_id);
                      const viva = vivaDraft[p.student_id] ?? 0;
                      const res = examPaperMarks({
                        questions_per_student: 2,
                        mix: { easy, medium, hard },
                        visible_count: 2,
                        hidden_count: 3,
                        marks_per_test: 5,
                        viva,
                        duration_min: durationMin,
                      });
                      return (
                        <tr key={p.id}>
                          <td>{prof?.full_name ?? p.student_id}</td>
                          <td className="xe-mono">{res.perQuestion * 2}</td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              max={10}
                              value={viva}
                              onChange={(e) =>
                                setVivaDraft((prev) => ({
                                  ...prev,
                                  [p.student_id]: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                                }))
                              }
                              style={{ width: 64 }}
                            />
                          </td>
                          <td className="xe-mono">{res.total} / 60</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
