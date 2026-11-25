import { useMemo, useState } from 'react';
import { Banner, Card, Chip, Empty, PageHead, statusTone } from '../../../components/ui';
import { CalendarFeedCard } from '../../../components/CalendarFeedCard';
import { formatIstDate } from '../../../lib/format';
import { useAction } from '../../../lib/hooks';
import { applyMerge, planDates, suggestMerge } from '../../../lib/logic/flows';
import { rpc } from '../../../lib/supabase';
import type { Course, HolidayRow, SessionRow } from '../../../lib/types';

const DEFAULT_TOPICS = Array.from({ length: 30 }, (_, i) => `Lab Session ${i + 1}`);

export function SessionPlanStep({
  course,
  sessions,
  holidays,
  onReload,
  onGoQuestions,
}: {
  course: Course;
  sessions: SessionRow[];
  holidays: HolidayRow[];
  onReload: () => void;
  onGoQuestions: () => void;
}) {
  const [start, setStart] = useState('2027-01-04');
  const [end, setEnd] = useState('2027-04-30');
  const [weekdays, setWeekdays] = useState<number[]>([1]); // Monday
  const [extraHolidays, setExtraHolidays] = useState('');
  const [reserveLast, setReserveLast] = useState(true);
  const [topics, setTopics] = useState<string[]>(() =>
    sessions.length > 0 ? sessions.map((s) => s.topic) : DEFAULT_TOPICS,
  );
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const allHolidays = useMemo(() => {
    const extra = extraHolidays
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return [...holidays.map((h) => h.day), ...extra];
  }, [holidays, extraHolidays]);

  const preview = useMemo(
    () =>
      planDates({
        start,
        end,
        weekdays,
        holidays: allHolidays,
        sessions: topics.length,
        reserveLast,
      }),
    [start, end, weekdays, allHolidays, topics.length, reserveLast],
  );

  const mergeSuggestion = preview.shortBy > 0 ? suggestMerge(topics) : null;

  const saveAction = useAction(async () => {
    const paddedDates = topics.map((_, idx) => preview.dates[idx] ?? end);
    await rpc('save_session_plan', {
      p_course_id: course.id,
      p_topics: topics,
      p_dates: paddedDates,
    });
  });

  const toggleDay = (d: number) => {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const activeCount = sessions.filter((s) => s.status === 'active' || s.status === 'conducted').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead
        kicker="STEP 3 · PLAN"
        title="Session plan"
        lead="Generate lab dates from the academic calendar, handle holidays, and preview before saving."
      />

      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
      {saveAction.message ? <Banner tone={saveAction.message.tone}>{saveAction.message.text}</Banner> : null}

      <Card
        title="Calendar inputs"
        actions={
          <Chip tone={preview.shortBy === 0 ? 'good' : 'warn'}>
            {preview.availableCount} available / {topics.length} needed
          </Chip>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label className="xe-field">
            <span>First lab day</span>
            <input type="date" className="xe-input xe-mono" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="xe-field">
            <span>Last teaching day</span>
            <input type="date" className="xe-input xe-mono" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="xe-field" style={{ flex: '1 1 200px' }}>
            <span>Extra holidays (YYYY-MM-DD, comma-separated)</span>
            <input
              className="xe-input xe-mono"
              value={extraHolidays}
              onChange={(e) => setExtraHolidays(e.target.value)}
              placeholder="2027-01-26, 2027-03-08"
            />
          </label>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Lab weekdays:</span>
          {[
            [1, 'Mon'],
            [2, 'Tue'],
            [3, 'Wed'],
            [4, 'Thu'],
            [5, 'Fri'],
            [6, 'Sat'],
          ].map(([d, label]) => (
            <label key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={weekdays.includes(Number(d))}
                onChange={() => toggleDay(Number(d))}
              />
              {label}
            </label>
          ))}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginLeft: 'auto' }}>
            <input
              type="checkbox"
              checked={reserveLast}
              onChange={(e) => setReserveLast(e.target.checked)}
            />
            Reserve last day for makeup
          </label>
        </div>
      </Card>

      {preview.shortBy > 0 && mergeSuggestion ? (
        <Banner tone="info">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>
              Short by <strong className="xe-mono">{preview.shortBy}</strong> session(s). Assist
              suggests merging: <strong>{mergeSuggestion.merged}</strong>
            </span>
            <button
              type="button"
              className="xe-btn xe-btn--assist"
              onClick={() => setTopics((prev) => applyMerge(prev, mergeSuggestion.index))}
            >
              Accept merge
            </button>
          </div>
        </Banner>
      ) : null}

      <Card
        title="Schedule preview"
        actions={
          <button
            type="button"
            className="xe-btn xe-btn--primary"
            disabled={saveAction.busy}
            onClick={() =>
              void saveAction.run().then((r) => {
                if (r !== null) {
                  setMsg({ tone: 'ok', text: `Saved ${topics.length} sessions to calendar.` });
                  onReload();
                }
              })
            }
          >
            Save session plan
          </button>
        }
        noPadding
      >
        <div className="xe-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="xe-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Planned date</th>
                <th>Topic</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((topic, idx) => (
                <tr key={idx}>
                  <td className="xe-mono">S{idx + 1}</td>
                  <td className="xe-mono" style={{ fontSize: 12 }}>
                    {preview.dates[idx] ? formatIstDate(preview.dates[idx]!) : 'Unassigned'}
                  </td>
                  <td>{topic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={`${activeCount}/${sessions.length} active in calendar`}
        actions={
          <button type="button" className="xe-btn" onClick={onGoQuestions}>
            Review questions to activate sessions →
          </button>
        }
        noPadding
      >
        {sessions.length === 0 ? (
          <div style={{ padding: 16 }}>
            <Empty message="No sessions saved yet. Click Save session plan above." />
          </div>
        ) : (
          <div className="xe-table-wrap">
            <table className="xe-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Date</th>
                  <th>Topic</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="xe-mono">S{s.n}</td>
                    <td className="xe-mono" style={{ fontSize: 12 }}>
                      {s.scheduled_date ? formatIstDate(s.scheduled_date) : '—'}
                    </td>
                    <td>{s.topic}</td>
                    <td>
                      <Chip tone={statusTone(s.status)}>{s.status}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CalendarFeedCard />
    </div>
  );
}
