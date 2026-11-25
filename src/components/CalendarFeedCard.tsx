import { useState } from 'react';
import { Banner, Card } from './ui';
import { useAction } from '../lib/hooks';
import { useSession } from '../lib/session';
import { rpc } from '../lib/supabase';

export function CalendarFeedCard() {
  const { profile, refresh } = useSession();
  const [msg, setMsg] = useState<string | null>(null);

  const rotateAction = useAction(async () => {
    await rpc('rotate_calendar_token');
    await refresh();
  });

  const baseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co').replace(/\/+$/, '');
  const feedUrl = `${baseUrl}/functions/v1/calendar?t=${profile?.calendar_token ?? ''}`;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setMsg('Calendar link copied.');
    } catch {
      setMsg('Select and copy the URL above.');
    }
  };

  return (
    <Card title="Personal calendar feed (ICS)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          aria-label="Calendar feed URL"
          readOnly
          className="xe-input xe-mono"
          style={{ fontSize: 12 }}
          value={feedUrl}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="xe-btn" onClick={() => void copyUrl()}>
            Copy link
          </button>
          <button
            type="button"
            className="xe-btn"
            disabled={rotateAction.busy}
            onClick={() =>
              void rotateAction.run().then(() => setMsg('Calendar token reset. Old link stopped working.'))
            }
          >
            Reset link
          </button>
        </div>
        {msg ? <Banner tone="ok">{msg}</Banner> : null}
      </div>
    </Card>
  );
}
