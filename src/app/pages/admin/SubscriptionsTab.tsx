import { useState, type FormEvent } from 'react';
import { Card, Chip, Empty, statusTone } from '../../../components/ui';
import { formatIstDate, todayIso } from '../../../lib/format';
import { useAction } from '../../../lib/hooks';
import { planEndDate } from '../../../lib/logic/credits';
import { rpc } from '../../../lib/supabase';
import type {
  Institution,
  PlanRow,
  PlanTier,
  Profile,
  SubscriptionRequestRow,
} from '../../../lib/types';

export function SubscriptionsTab({
  plans,
  institutions,
  profiles,
  requests,
  onChanged,
  onBanner,
}: {
  plans: PlanRow[];
  institutions: Institution[];
  profiles: Profile[];
  requests: SubscriptionRequestRow[];
  onChanged: () => void;
  onBanner: (tone: 'ok' | 'err', text: string) => void;
}) {
  const [reqInstId, setReqInstId] = useState(institutions[0]?.id ?? '');
  const [reqPlan, setReqPlan] = useState<PlanTier>('pro');
  const [reqStart, setReqStart] = useState(() => todayIso());
  const [reqMonths, setReqMonths] = useState<number>(6);

  const updatePlanAction = useAction(async (tier: PlanTier, total: number, daily: number) => {
    await rpc('admin_update_plan', { p_tier: tier, p_total_cap: total, p_daily_cap: daily });
  });

  const recordReqAction = useAction(async () => {
    await rpc('create_subscription_request', {
      p_institution_id: reqInstId,
      p_plan: reqPlan,
      p_start_date: reqStart,
      p_months: reqMonths,
    });
  });

  const decideAction = useAction(async (requestId: string, approve: boolean) => {
    await rpc('decide_subscription', { p_request_id: requestId, p_approve: approve });
  });

  const handleCapChange = async (plan: PlanRow, field: 'total' | 'daily', value: number) => {
    const total = field === 'total' ? Math.max(0, value) : plan.total_cap;
    const daily = field === 'daily' ? Math.max(1, value) : plan.daily_cap;
    await updatePlanAction.run(plan.tier, total, daily);
    onBanner('ok', `Updated ${plan.tier.toUpperCase()} caps.`);
    onChanged();
  };

  const handleRecord = async (e: FormEvent) => {
    e.preventDefault();
    if (!reqInstId) return;
    await recordReqAction.run();
    onBanner('ok', 'Subscription request recorded.');
    onChanged();
  };

  const handleDecide = async (rq: SubscriptionRequestRow, approve: boolean) => {
    await decideAction.run(rq.id, approve);
    onBanner('ok', approve ? 'Subscription approved.' : 'Subscription request rejected.');
    onChanged();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {plans.map((p) => {
          const instCount = institutions.filter((i) => i.plan === p.tier).length;
          const instIds = new Set(institutions.filter((i) => i.plan === p.tier).map((i) => i.id));
          const facActive = profiles.filter(
            (u) => u.role === 'faculty' && u.active && u.institution_id && instIds.has(u.institution_id),
          ).length;

          return (
            <Card key={p.tier}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <strong style={{ fontSize: 18 }}>{p.tier === 'pro' ? 'Pro' : 'Elite'}</strong>
                <span className="xe-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {instCount} institutions · {facActive} faculty active
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                <label className="xe-field">
                  <span>AI runs per subscription</span>
                  <input
                    type="number"
                    min={0}
                    className="xe-input xe-mono"
                    style={{ width: 120 }}
                    defaultValue={p.total_cap}
                    onBlur={(e) => void handleCapChange(p, 'total', Number(e.target.value))}
                  />
                </label>
                <label className="xe-field">
                  <span>Daily cap</span>
                  <input
                    type="number"
                    min={1}
                    className="xe-input xe-mono"
                    style={{ width: 100 }}
                    defaultValue={p.daily_cap}
                    onBlur={(e) => void handleCapChange(p, 'daily', Number(e.target.value))}
                  />
                </label>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                One run = one AI drafting request. Approvals, uploads, and monitoring never use runs.
              </p>
            </Card>
          );
        })}
      </div>

      <Card title="Record subscription request">
        <form
          onSubmit={(e) => void handleRecord(e)}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}
        >
          <label className="xe-field">
            <span>Institution</span>
            <select
              className="xe-select"
              value={reqInstId}
              onChange={(e) => setReqInstId(e.target.value)}
            >
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label className="xe-field">
            <span>Plan</span>
            <select
              className="xe-select"
              value={reqPlan}
              onChange={(e) => setReqPlan(e.target.value as PlanTier)}
            >
              <option value="pro">Pro</option>
              <option value="elite">Elite</option>
            </select>
          </label>
          <label className="xe-field">
            <span>Start date</span>
            <input
              type="date"
              className="xe-input xe-mono"
              value={reqStart}
              onChange={(e) => setReqStart(e.target.value)}
            />
          </label>
          <label className="xe-field">
            <span>Duration</span>
            <select
              className="xe-select"
              value={reqMonths}
              onChange={(e) => setReqMonths(Number(e.target.value))}
            >
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </label>
          <button type="submit" className="xe-btn xe-btn--primary" disabled={recordReqAction.busy}>
            Record request
          </button>
        </form>
      </Card>

      <Card title="Subscription requests (approved manually)" noPadding>
        {requests.length === 0 ? (
          <div style={{ padding: 16 }}>
            <Empty message="No subscription requests yet." />
          </div>
        ) : (
          <div className="xe-table-wrap">
            <table className="xe-table">
              <thead>
                <tr>
                  <th>Institution</th>
                  <th>Plan</th>
                  <th>Start</th>
                  <th>Duration</th>
                  <th>Valid until</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {requests.map((rq) => {
                  const instName =
                    institutions.find((i) => i.id === rq.institution_id)?.name ?? 'Institution';
                  const validUntil =
                    rq.status === 'rejected'
                      ? '—'
                      : formatIstDate(planEndDate(rq.start_date, rq.months));
                  const label =
                    rq.status === 'approved'
                      ? 'Active'
                      : rq.status === 'sent'
                        ? 'Pending approval'
                        : 'Rejected';

                  return (
                    <tr key={rq.id}>
                      <td style={{ fontWeight: 500 }}>{instName}</td>
                      <td>{rq.plan === 'pro' ? 'Pro' : 'Elite'}</td>
                      <td className="xe-mono" style={{ fontSize: 12 }}>
                        {formatIstDate(rq.start_date)}
                      </td>
                      <td className="xe-mono">{rq.months} months</td>
                      <td className="xe-mono" style={{ fontSize: 12 }}>
                        {validUntil}
                      </td>
                      <td>
                        <Chip tone={statusTone(rq.status === 'approved' ? 'active' : rq.status)}>
                          {label}
                        </Chip>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {rq.status === 'sent' ? (
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              className="xe-btn xe-btn--teal"
                              disabled={decideAction.busy}
                              onClick={() => void handleDecide(rq, true)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="xe-btn"
                              disabled={decideAction.busy}
                              onClick={() => void handleDecide(rq, false)}
                            >
                              Reject
                            </button>
                          </div>
                        ) : null}
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
