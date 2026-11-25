import { Bar, Card, Chip, Empty, Kpis } from '../../../components/ui';
import { formatIstDate } from '../../../lib/format';
import { useAction } from '../../../lib/hooks';
import { creditStatus } from '../../../lib/logic/credits';
import { rpc } from '../../../lib/supabase';
import type { AiUsageReportRow, PlanTier } from '../../../lib/types';

export function CreditsTab({
  rows,
  onChanged,
  onBanner,
}: {
  rows: AiUsageReportRow[];
  onChanged: () => void;
  onBanner: (tone: 'ok' | 'err', text: string) => void;
}) {
  const switchPlan = useAction(async (institutionId: string, tier: PlanTier) => {
    await rpc('admin_switch_institution_plan', { p_institution_id: institutionId, p_tier: tier });
  });

  const handleSwitch = async (row: AiUsageReportRow) => {
    const nextTier: PlanTier = row.plan === 'elite' ? 'pro' : 'elite';
    await switchPlan.run(row.institution_id, nextTier);
    onBanner(
      'ok',
      `${row.institution_name} moved to ${nextTier === 'elite' ? 'Elite' : 'Pro'}.`,
    );
    onChanged();
  };

  const usedAll = rows.reduce((acc, r) => acc + r.used_total, 0);
  const todayAll = rows.reduce((acc, r) => acc + r.used_today, 0);
  const atCapCount = rows.filter((r) => {
    const st = creditStatus(r.used_total, r.total_cap, r.used_today, r.daily_cap);
    return st === 'Daily cap reached' || st === 'Subscription runs used up';
  }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Kpis
        items={[
          { label: 'Faculty with AI plans', value: rows.length },
          { label: 'Runs used this term', value: usedAll },
          { label: 'Runs today', value: todayAll },
          { label: 'At a cap today', value: atCapCount },
        ]}
      />

      <Card noPadding>
        {rows.length === 0 ? (
          <div style={{ padding: 16 }}>
            <Empty message="No faculty AI credit records yet." />
          </div>
        ) : (
          <div className="xe-table-wrap">
            <table className="xe-table">
              <thead>
                <tr>
                  <th>Faculty</th>
                  <th>Plan</th>
                  <th>Valid until</th>
                  <th>Used this subscription</th>
                  <th style={{ textAlign: 'right' }}>Today</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = creditStatus(r.used_total, r.total_cap, r.used_today, r.daily_cap);
                  const pct =
                    r.total_cap > 0 ? Math.min(100, Math.round((100 * r.used_total) / r.total_cap)) : 0;
                  const tone =
                    st === 'OK' ? 'good' : st === 'Running low' ? 'warn' : 'bad';
                  const left = Math.max(0, r.total_cap - r.used_total);

                  return (
                    <tr key={r.user_id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{r.full_name}</div>
                        <div className="xe-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {r.email}
                        </div>
                      </td>
                      <td>{r.plan ? (r.plan === 'elite' ? 'Elite' : 'Pro') : '—'}</td>
                      <td className="xe-mono" style={{ fontSize: 12 }}>
                        {r.plan_end ? formatIstDate(r.plan_end) : '—'}
                      </td>
                      <td style={{ minWidth: 190 }}>
                        <div className="xe-mono" style={{ fontSize: 12, marginBottom: 4 }}>
                          {r.used_total} of {r.total_cap} used · {left} left
                        </div>
                        <Bar value={pct} label={`${r.full_name} subscription usage`} />
                      </td>
                      <td className="xe-mono" style={{ textAlign: 'right' }}>
                        {r.used_today}/{r.daily_cap}
                      </td>
                      <td>
                        <Chip tone={tone}>{st}</Chip>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="xe-btn"
                          disabled={switchPlan.busy}
                          onClick={() => void handleSwitch(r)}
                        >
                          {r.plan === 'elite' ? 'Move to Pro' : 'Move to Elite'}
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
  );
}
