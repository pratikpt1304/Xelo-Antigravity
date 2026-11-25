import { useState } from 'react';
import { Banner, Card, Chip, Empty, Kpis, PageHead } from '../../../components/ui';
import { useAction } from '../../../lib/hooks';
import { overlaps, parseMcqCsv } from '../../../lib/logic/prep';
import { fn, rpc, supabase } from '../../../lib/supabase';
import type { BankItemRow, Course, SessionRow } from '../../../lib/types';

export function BanksStep({
  course,
  sessions,
  bankItems,
  onReload,
}: {
  course: Course;
  sessions: SessionRow[];
  bankItems: BankItemRow[];
  onReload: () => void;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id ?? '');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const activeSess = sessions.find((s) => s.id === selectedSessionId) ?? sessions[0] ?? null;

  const approveAction = useAction(async (sessionId: string, bank: 'pre' | 'post') => {
    await rpc('approve_bank', { p_session_id: sessionId, p_bank: bank });
  });

  const genAction = useAction(async (sess: SessionRow) => {
    await fn('ai-generate', {
      kind: 'bank',
      course_id: course.id,
      session_id: sess.id,
      topic: sess.topic,
    });
  });

  const deleteItem = useAction(async (id: string) => {
    await supabase.from('bank_items').delete().eq('id', id);
  });

  const sessItems = activeSess ? bankItems.filter((b) => b.session_id === activeSess.id) : [];
  const preItems = sessItems.filter((b) => b.bank === 'pre');
  const postItems = sessItems.filter((b) => b.bank === 'post');
  const overlapPairs = overlaps(preItems, postItems);
  const overlapIds = new Set(overlapPairs.flatMap((p) => [p.preId, p.postId]));

  const countLevels = (items: BankItemRow[]) => ({
    easy: items.filter((i) => i.level === 'easy').length,
    medium: items.filter((i) => i.level === 'medium').length,
    hard: items.filter((i) => i.level === 'hard').length,
  });

  const activeBanksCount = sessions.filter((s) => {
    const items = bankItems.filter((b) => b.session_id === s.id);
    const preOk = items.some((i) => i.bank === 'pre' && i.approved);
    const postOk = items.some((i) => i.bank === 'post' && i.approved);
    return preOk && postOk;
  }).length;

  const readyToApprove = sessions.filter((s) => {
    const items = bankItems.filter((b) => b.session_id === s.id);
    const pre = countLevels(items.filter((i) => i.bank === 'pre'));
    const post = countLevels(items.filter((i) => i.bank === 'post'));
    const allApproved = items.some((i) => i.bank === 'pre' && i.approved) && items.some((i) => i.bank === 'post' && i.approved);
    return !allApproved && pre.easy >= 15 && pre.medium >= 15 && pre.hard >= 15 && post.easy >= 15 && post.medium >= 15 && post.hard >= 15;
  });

  const handleBulkApprove = async () => {
    for (const s of readyToApprove) {
      await approveAction.run(s.id, 'pre');
      await approveAction.run(s.id, 'post');
    }
    setMsg({ tone: 'ok', text: `Approved ${readyToApprove.length} ready session bank pair(s).` });
    onReload();
  };

  const handleBulkGen = async () => {
    const missing = sessions.filter((s) => !bankItems.some((b) => b.session_id === s.id));
    for (const s of missing) {
      const r = await genAction.run(s);
      if (r === null) break;
    }
    onReload();
  };

  const handleCsvUpload = async (file: File | undefined) => {
    if (!file || !activeSess) return;
    const text = await file.text();
    const parsed = parseMcqCsv(text);
    if (parsed.length === 0) {
      setMsg({ tone: 'err', text: 'No valid rows found in CSV (stage,level,question,options(|),answer).' });
      return;
    }
    await supabase.from('bank_items').insert(
      parsed.map((m) => ({
        session_id: activeSess.id,
        bank: m.bank,
        level: m.level,
        stem: m.stem,
        options: m.options,
        answer: m.answer,
        approved: false,
      })),
    );
    setMsg({ tone: 'ok', text: `Uploaded ${parsed.length} MCQ items to S${activeSess.n}.` });
    onReload();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead
        kicker="STEP 5 · PREPARE"
        title="Pre and post-test banks"
        lead="15 easy + 15 medium + 15 hard per bank, with no overlap between pre and post."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="xe-btn xe-btn--primary"
              disabled={readyToApprove.length === 0 || approveAction.busy}
              onClick={() => void handleBulkApprove()}
            >
              Approve {readyToApprove.length} ready banks
            </button>
            <button
              type="button"
              className="xe-btn"
              disabled={genAction.busy}
              onClick={() => void handleBulkGen()}
            >
              Generate missing banks with Assist
            </button>
          </div>
        }
      />

      <Kpis
        items={[
          { label: 'Active banks', value: `${activeBanksCount}/${sessions.length}` },
          { label: 'Pre-test draw', value: '2E · 2M · 1H' },
          { label: 'Post-test draw', value: '1E · 2M · 2H' },
          { label: 'Pre/post overlap', value: overlapPairs.length },
        ]}
      />

      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
      {approveAction.message ? <Banner tone={approveAction.message.tone}>{approveAction.message.text}</Banner> : null}
      {genAction.message ? <Banner tone={genAction.message.tone}>{genAction.message.text}</Banner> : null}

      {sessions.length === 0 ? (
        <Empty message="Save a session plan in Step 3 before preparing banks." />
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`xe-btn xe-mono ${activeSess?.id === s.id ? 'xe-btn--primary' : ''}`}
                onClick={() => setSelectedSessionId(s.id)}
              >
                S{s.n}
              </button>
            ))}
          </div>

          {activeSess ? (
            <>
              <Card
                title={`S${activeSess.n} · ${activeSess.topic}`}
                actions={
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="xe-btn xe-btn--assist"
                      disabled={genAction.busy}
                      onClick={() => void genAction.run(activeSess).then(onReload)}
                    >
                      Generate with AI
                    </button>
                    <label className="xe-btn">
                      Upload MCQs (CSV)
                      <input
                        type="file"
                        accept=".csv"
                        style={{ display: 'none' }}
                        onChange={(e) => void handleCsvUpload(e.target.files?.[0])}
                      />
                    </label>
                  </div>
                }
              >
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  CSV format: <span className="xe-mono">stage,level,question,opt1|opt2|opt3|opt4,A</span>
                </div>
              </Card>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: 14,
                }}
              >
                {(['pre', 'post'] as const).map((bankKind) => {
                  const items = bankKind === 'pre' ? preItems : postItems;
                  const counts = countLevels(items);
                  const isApproved = items.length > 0 && items.every((i) => i.approved);

                  return (
                    <Card
                      key={bankKind}
                      title={`${bankKind === 'pre' ? 'Pre-test' : 'Post-test'} bank`}
                      actions={
                        isApproved ? (
                          <Chip tone="good">Approved</Chip>
                        ) : (
                          <button
                            type="button"
                            className="xe-btn xe-btn--teal"
                            disabled={approveAction.busy}
                            onClick={() =>
                              void approveAction.run(activeSess.id, bankKind).then(onReload)
                            }
                          >
                            Approve bank
                          </button>
                        )
                      }
                    >
                      <div className="xe-mono" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                        E: {counts.easy}/15 · M: {counts.medium}/15 · H: {counts.hard}/15
                      </div>
                      {items.length === 0 ? (
                        <Empty message="No items yet." />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                          {items.slice(0, 15).map((item) => (
                            <div
                              key={item.id}
                              style={{
                                padding: 8,
                                borderRadius: 5,
                                border: '1px solid var(--border-soft)',
                                fontSize: 13,
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 8,
                              }}
                            >
                              <div>
                                <span className="xe-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                                  [{item.level}]
                                </span>{' '}
                                {item.stem}
                                {overlapIds.has(item.id) ? (
                                  <div style={{ marginTop: 4 }}>
                                    <Chip tone="warn">Overlaps the other bank</Chip>
                                  </div>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                className="xe-btn"
                                onClick={() => void deleteItem.run(item.id).then(onReload)}
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
