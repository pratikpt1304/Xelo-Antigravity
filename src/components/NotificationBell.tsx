import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatIstDateTime } from '../lib/format';
import { useLoad } from '../lib/hooks';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import type { NotificationRow } from '../lib/types';

export function NotificationBell({ dark = false }: { dark?: boolean }) {
  const { profile } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data: items, reload } = useLoad(async () => {
    if (!profile) return [] as NotificationRow[];
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(30);
    return (data ?? []) as NotificationRow[];
  }, [profile?.id]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`notif-bell-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => reload(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [profile, reload]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const list = items ?? [];
  const unread = list.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!profile || unread === 0) return;
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', profile.id)
      .is('read_at', null);
    reload();
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label={`Notifications (${unread} unread)`}
        className="xe-btn"
        style={
          dark
            ? { background: '#2C2B28', borderColor: '#3D3B36', color: '#FFFFFF' }
            : undefined
        }
        onClick={() => setOpen((o) => !o)}
      >
        <span>Alerts</span>
        {unread > 0 ? <span className="xe-console-badge">{unread}</span> : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            width: 320,
            maxHeight: 380,
            overflowY: 'auto',
            background: '#FFFFFF',
            color: '#141413',
            border: '1px solid #E2E0D8',
            borderRadius: 6,
            zIndex: 60,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            <button type="button" className="xe-btn" style={{ minHeight: 26, fontSize: 12 }} onClick={() => void markAllRead()}>
              Mark all read
            </button>
          </div>

          {list.length === 0 ? (
            <div style={{ fontSize: 12, color: '#6B6A63', padding: '12px 0', textAlign: 'center' }}>
              No notifications yet.
            </div>
          ) : (
            list.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (n.link) navigate(n.link);
                }}
                style={{
                  textAlign: 'left',
                  padding: 8,
                  border: '1px solid #EFEDE6',
                  borderRadius: 5,
                  background: n.read_at ? '#FFFFFF' : '#FBFAF7',
                  color: '#141413',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: n.read_at ? 400 : 600, fontSize: 13 }}>{n.title}</div>
                {n.body ? <div style={{ fontSize: 12, color: '#6B6A63' }}>{n.body}</div> : null}
                <div className="xe-mono" style={{ fontSize: 11, color: '#9C9A92', marginTop: 2 }}>
                  {formatIstDateTime(n.created_at)}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
