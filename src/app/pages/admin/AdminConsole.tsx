import { useState } from 'react';
import { Banner, ErrorNote, Loading, PageHead } from '../../../components/ui';
import { useLoad } from '../../../lib/hooks';
import { must, rpc, supabase } from '../../../lib/supabase';
import type {
  AiUsageReportRow,
  AuditRow,
  Department,
  Institution,
  InviteRow,
  PlanRow,
  Profile,
  School,
  SubscriptionRequestRow,
} from '../../../lib/types';
import { ConsoleShell } from '../../components/ConsoleShell';
import { AuditTab } from './AuditTab';
import { CreditsTab } from './CreditsTab';
import { InstitutionsTab } from './InstitutionsTab';
import { SubscriptionsTab } from './SubscriptionsTab';
import { UsersTab } from './UsersTab';

type AdminTabId = 'users' | 'institutions' | 'subs' | 'credits' | 'audit';

const TAB_META: Record<AdminTabId, { title: string; lead: string }> = {
  users: {
    title: 'Users and roles',
    lead: 'Create logins and map emails for VC, CoE, deans, HODs and faculty',
  },
  institutions: {
    title: 'Institutions',
    lead: 'Manage institutions, schools, departments and subscription status',
  },
  subs: {
    title: 'Subscriptions',
    lead: 'Plans and AI limits; requests approved manually with a duration',
  },
  credits: {
    title: 'AI credits',
    lead: 'Usage per faculty against their subscription caps',
  },
  audit: {
    title: 'Audit log',
    lead: 'Every change made in this console',
  },
};

export function AdminConsole() {
  const [tab, setTab] = useState<AdminTabId>('users');
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const { data, loading, error, reload } = useLoad(async () => {
    const [instRes, schoolRes, deptRes, profRes, invRes, planRes, reqRes, auditRes, credits] =
      await Promise.all([
        supabase.from('institutions').select('*').order('name'),
        supabase.from('schools').select('*').order('name'),
        supabase.from('departments').select('*').order('code'),
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('invites').select('*').order('created_at', { ascending: false }),
        supabase.from('plans').select('*').order('tier'),
        supabase.from('subscription_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(200),
        rpc<AiUsageReportRow[]>('ai_usage_report').catch(() => [] as AiUsageReportRow[]),
      ]);

    return {
      institutions: must(instRes) as Institution[],
      schools: must(schoolRes) as School[],
      departments: must(deptRes) as Department[],
      profiles: must(profRes) as Profile[],
      invites: must(invRes) as InviteRow[],
      plans: must(planRes) as PlanRow[],
      requests: must(reqRes) as SubscriptionRequestRow[],
      audit: must(auditRes) as AuditRow[],
      credits: credits ?? [],
    };
  }, []);

  const pendingSubs = data?.requests.filter((r) => r.status === 'sent').length ?? 0;

  return (
    <ConsoleShell
      portalTitle="Super admin"
      scopeLabel="All institutions"
      tabs={[
        { id: 'users', label: 'Users and roles' },
        { id: 'institutions', label: 'Institutions' },
        { id: 'subs', label: 'Subscriptions', badge: pendingSubs },
        { id: 'credits', label: 'AI credits' },
        { id: 'audit', label: 'Audit log' },
      ]}
      activeTab={tab}
      onSelectTab={(id) => {
        setTab(id as AdminTabId);
        setBanner(null);
      }}
    >
      <PageHead title={TAB_META[tab].title} lead={TAB_META[tab].lead} />
      {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
      {error ? <ErrorNote message={error} /> : null}
      {loading || !data ? (
        <Loading />
      ) : (
        <>
          {tab === 'users' ? (
            <UsersTab
              institutions={data.institutions}
              schools={data.schools}
              departments={data.departments}
              profiles={data.profiles}
              invites={data.invites}
              onChanged={reload}
              onBanner={(tone, text) => setBanner({ tone, text })}
            />
          ) : null}
          {tab === 'institutions' ? (
            <InstitutionsTab
              institutions={data.institutions}
              schools={data.schools}
              departments={data.departments}
              onChanged={reload}
              onBanner={(tone, text) => setBanner({ tone, text })}
            />
          ) : null}
          {tab === 'subs' ? (
            <SubscriptionsTab
              plans={data.plans}
              institutions={data.institutions}
              profiles={data.profiles}
              requests={data.requests}
              onChanged={reload}
              onBanner={(tone, text) => setBanner({ tone, text })}
            />
          ) : null}
          {tab === 'credits' ? (
            <CreditsTab
              rows={data.credits}
              onChanged={reload}
              onBanner={(tone, text) => setBanner({ tone, text })}
            />
          ) : null}
          {tab === 'audit' ? <AuditTab rows={data.audit} profiles={data.profiles} /> : null}
        </>
      )}
    </ConsoleShell>
  );
}
