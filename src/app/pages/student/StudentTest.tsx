import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Banner, Card, ErrorNote, Loading, PageHead } from '../../../components/ui';
import { useAction, useLoad } from '../../../lib/hooks';
import { rpc } from '../../../lib/supabase';
import { StudentShell } from './StudentShell';

interface TestItem {
  id: string;
  level: string;
  stem: string;
  options: string[];
}

export function StudentTest() {
  const { sessionId, bank = 'pre' } = useParams<{ sessionId: string; bank: 'pre' | 'post' }>();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [score, setScore] = useState<number | null>(null);

  const { data, loading, error } = useLoad(async () => {
    if (!sessionId) throw new Error('not_found');
    return await rpc<{ attempt_id: string; items: TestItem[] }>('start_test', {
      p_session_id: sessionId,
      p_bank: bank,
    });
  }, [sessionId, bank]);

  const submitAction = useAction(async () => {
    if (!data) return null;
    const s = await rpc<number>('submit_test', {
      p_attempt_id: data.attempt_id,
      p_answers: answers,
    });
    setScore(s);
    return s;
  });

  return (
    <StudentShell todaySessionId={sessionId}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760, margin: '0 auto' }}>
        <PageHead
          kicker={bank === 'pre' ? 'PRE-TEST · 5 MCQS' : 'POST-TEST · 5 MCQS'}
          title={bank === 'pre' ? 'Pre-test' : 'Post-test'}
          lead="One attempt only. Answers are scored on the server."
        />

        {error ? <ErrorNote message={error} /> : null}
        {submitAction.message ? <Banner tone={submitAction.message.tone}>{submitAction.message.text}</Banner> : null}

        {score !== null ? (
          <Card title="Test submitted">
            <p style={{ margin: '0 0 12px' }}>
              Your score: <strong className="xe-mono">{score}/5</strong>
            </p>
            <button type="button" className="xe-btn xe-btn--primary" onClick={() => navigate('/student')}>
              Back to home
            </button>
          </Card>
        ) : loading || !data ? (
          <Loading />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.items.map((item, idx) => (
              <Card key={item.id} title={`Q${idx + 1} (${item.level})`}>
                <p style={{ margin: '0 0 10px', fontWeight: 500 }}>{item.stem}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {item.options.map((opt, oIdx) => (
                    <label key={oIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input
                        type="radio"
                        name={item.id}
                        checked={answers[item.id] === oIdx}
                        onChange={() => setAnswers((prev) => ({ ...prev, [item.id]: oIdx }))}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </Card>
            ))}
            <div>
              <button
                type="button"
                className="xe-btn xe-btn--primary"
                disabled={submitAction.busy}
                onClick={() => void submitAction.run()}
              >
                Submit test
              </button>
            </div>
          </div>
        )}
      </div>
    </StudentShell>
  );
}
