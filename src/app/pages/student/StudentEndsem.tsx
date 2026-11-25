import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banner, Card, Chip, Empty, ErrorNote, Kpis, Loading, PageHead, statusTone } from '../../../components/ui';
import { formatIstDate, formatIstDateTime } from '../../../lib/format';
import { useAction, useLoad } from '../../../lib/hooks';
import { attendancePct } from '../../../lib/logic/rubric';
import {
  getActiveStreams,
  loadMediaPipeWasm,
  requestCameraStream,
  requestScreenShare,
} from '../../../lib/proctor-runtime';
import { must, rpc, supabase } from '../../../lib/supabase';
import type { AttendanceRow, Course, EnrollmentRow, SessionRow } from '../../../lib/types';
import { useSession } from '../../../lib/session';
import { StudentShell } from './StudentShell';

interface StudentAssessmentRow {
  id: string;
  course_id: string;
  batch_id: string;
  exam_date: string | null;
  start_at: string | null;
  end_at: string | null;
  room: string | null;
  stage: string;
  added_to_file: boolean;
}

interface StudentPaperRow {
  id: string;
  assessment_id: string;
  status: string;
  started_at: string | null;
  deadline: string | null;
  submitted_at: string | null;
  warnings: number;
  flagged: boolean;
}

export function StudentEndsem() {
  const { institution } = useSession();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [camOk, setCamOk] = useState(Boolean(getActiveStreams().camera));
  const [screenOk, setScreenOk] = useState(Boolean(getActiveStreams().screen));
  const [fsOk, setFsOk] = useState(Boolean(document.fullscreenElement));
  const [wasmOk, setWasmOk] = useState(false);
  const [checkErr, setCheckErr] = useState<string | null>(null);

  const { data, loading, error, reload } = useLoad(async () => {
    const [assRes, courseRes, enrRes, sessRes, attRes, paperRes] = await Promise.all([
      supabase.from('assessments').select('*').order('created_at', { ascending: false }),
      supabase.from('courses').select('*'),
      supabase.from('enrollments').select('*'),
      supabase.from('sessions').select('*'),
      supabase.from('attendance').select('*'),
      supabase.from('exam_papers').select('*'),
    ]);

    return {
      assessments: must(assRes) as StudentAssessmentRow[],
      courses: must(courseRes) as Course[],
      enrollments: must(enrRes) as EnrollmentRow[],
      sessions: must(sessRes) as SessionRow[],
      attendance: must(attRes) as AttendanceRow[],
      papers: must(paperRes) as StudentPaperRow[],
    };
  }, []);

  const assessment = data?.assessments[0] ?? null;

  useEffect(() => {
    if (!assessment || assessment.stage === 'active' || assessment.stage === 'ended') return;
    const t = window.setInterval(() => reload(), 5000);
    return () => window.clearInterval(t);
  }, [assessment, reload]);

  useEffect(() => {
    loadMediaPipeWasm()
      .then((ok) => setWasmOk(ok))
      .catch(() => setWasmOk(false));
  }, []);

  useEffect(() => {
    const stream = getActiveStreams().camera;
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [camOk]);

  const startExamAction = useAction(async () => {
    if (!assessment) return;
    await rpc('start_exam', { p_assessment_id: assessment.id });
    navigate(`/student/exam/${assessment.id}`);
  });

  const courseMap = new Map((data?.courses ?? []).map((c) => [c.id, c]));
  const paper = assessment ? (data?.papers ?? []).find((p) => p.assessment_id === assessment.id) ?? null : null;

  const minAtt = institution?.min_attendance_pct ?? 75;
  const attStates = (data?.attendance ?? []).map((a) => a.state);
  const pct = attendancePct(attStates);
  const eligible = attStates.length === 0 || pct >= minAtt;

  return (
    <StudentShell hasEndsem>
      <PageHead
        title="End-semester practical"
        lead="Check exam eligibility, complete the system check, and enter the proctored exam."
      />

      {loading && !data ? <Loading label="Loading end-sem details..." /> : null}
      {error ? <ErrorNote message={error} /> : null}

      {!loading && !assessment ? (
        <Empty message="No end-semester practical is scheduled for your batches yet." />
      ) : assessment ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Kpis
            items={[
              { label: 'Course', value: courseMap.get(assessment.course_id)?.code ?? 'Lab' },
              { label: 'Date', value: assessment.exam_date ? formatIstDate(assessment.exam_date) : 'TBD' },
              { label: 'Room', value: assessment.room ?? 'TBD' },
              { label: 'Attendance', value: `${pct}% (${eligible ? 'Eligible' : 'Detained'})` },
            ]}
          />

          {paper && (paper.status === 'submitted' || paper.status === 'ended' || assessment.stage === 'ended') ? (
            <Card title="Exam submitted & result status">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Chip tone={statusTone(paper.status)}>{paper.status}</Chip>
                  <Chip tone={paper.flagged ? 'warn' : 'good'}>Warnings: {paper.warnings}</Chip>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Submitted at: {paper.submitted_at ? formatIstDateTime(paper.submitted_at) : 'Auto-submitted at end'}
                </div>
                <div style={{ fontSize: 13 }}>
                  {assessment.added_to_file
                    ? 'Your end-sem practical marks have been finalized and added to the course file.'
                    : 'Your submission is recorded. Final marks (/60) will appear after faculty viva and flag review.'}
                </div>
              </div>
            </Card>
          ) : (
            <Card title="Secure system check & waiting room">
              <Banner tone="info">
                Camera snapshots are captured only on proctor alerts and kept for 90 days. No continuous video is
                recorded.
              </Banner>

              {checkErr ? (
                <div style={{ marginTop: 10 }}>
                  <Banner tone="err">{checkErr}</Banner>
                </div>
              ) : null}

              {startExamAction.message?.tone === 'err' ? (
                <div style={{ marginTop: 10 }}>
                  <ErrorNote message={startExamAction.message.text} />
                </div>
              ) : null}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  className={camOk ? 'xe-btn xe-btn-secondary' : 'xe-btn xe-btn-primary'}
                  onClick={async () => {
                    setCheckErr(null);
                    try {
                      await requestCameraStream();
                      setCamOk(true);
                    } catch {
                      setCheckErr('Camera permission is required for proctored exams.');
                    }
                  }}
                >
                  {camOk ? 'Camera ready' : '1. Check camera'}
                </button>

                <button
                  type="button"
                  className={screenOk ? 'xe-btn xe-btn-secondary' : 'xe-btn xe-btn-primary'}
                  onClick={async () => {
                    setCheckErr(null);
                    try {
                      await requestScreenShare();
                      setScreenOk(true);
                    } catch (err) {
                      setCheckErr(
                        err instanceof Error && err.message === 'entire_screen_required'
                          ? 'You must share your entire screen (monitor), not a single tab or window.'
                          : 'Screen share permission is required.',
                      );
                    }
                  }}
                >
                  {screenOk ? 'Screen ready' : '2. Share entire screen'}
                </button>

                <button
                  type="button"
                  className={fsOk ? 'xe-btn xe-btn-secondary' : 'xe-btn xe-btn-primary'}
                  onClick={async () => {
                    try {
                      await document.documentElement.requestFullscreen();
                      setFsOk(true);
                    } catch {
                      setFsOk(true);
                    }
                  }}
                >
                  {fsOk ? 'Fullscreen ready' : '3. Enter fullscreen'}
                </button>

                <Chip tone={wasmOk ? 'good' : 'neutral'}>
                  {wasmOk ? 'Face detector ready' : 'Loading detector...'}
                </Chip>
              </div>

              {camOk ? (
                <div style={{ marginTop: 12 }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{ width: 160, height: 120, borderRadius: 8, background: '#111', objectFit: 'cover' }}
                  />
                </div>
              ) : null}

              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Chip tone={assessment.stage === 'active' ? 'good' : 'warn'}>
                  Exam stage: {assessment.stage}
                </Chip>
                <button
                  type="button"
                  className="xe-btn xe-btn-primary"
                  disabled={assessment.stage !== 'active' || startExamAction.busy}
                  onClick={() => startExamAction.run()}
                >
                  {startExamAction.busy
                    ? 'Starting...'
                    : paper?.status === 'started'
                      ? 'Resume exam'
                      : 'Start exam'}
                </button>
              </div>
            </Card>
          )}
        </div>
      ) : null}
    </StudentShell>
  );
}
