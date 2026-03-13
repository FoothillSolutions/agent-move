import type { RecordedSession, SessionSummary, LiveSessionSummary, RecordedTimelineEvent, SessionComparison } from '@agent-move/shared';

/** Derive the base URL from current page location (same origin as WebSocket) */
function getBaseUrl(): string {
  return window.location.origin;
}

export async function fetchLiveSessions(): Promise<LiveSessionSummary[]> {
  const res = await fetch(`${getBaseUrl()}/api/sessions/live`);
  const data = await res.json();
  return data.sessions;
}

export async function fetchSessions(opts?: {
  project?: string;
  limit?: number;
  offset?: number;
}): Promise<{ sessions: SessionSummary[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.project) params.set('project', opts.project);
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  const res = await fetch(`${getBaseUrl()}/api/sessions?${params}`);
  return res.json();
}

export async function fetchSession(id: string): Promise<RecordedSession> {
  const res = await fetch(`${getBaseUrl()}/api/sessions/${id}`);
  if (!res.ok) throw new Error(`Session ${id} not found`);
  return res.json();
}

export async function fetchTimeline(id: string): Promise<RecordedTimelineEvent[]> {
  const res = await fetch(`${getBaseUrl()}/api/sessions/${id}/timeline`);
  const data = await res.json();
  return data.timeline;
}

export async function fetchComparison(idA: string, idB: string): Promise<SessionComparison> {
  const params = new URLSearchParams({ a: idA, b: idB });
  const res = await fetch(`${getBaseUrl()}/api/sessions/compare?${params}`);
  if (!res.ok) throw new Error('Comparison failed');
  return res.json();
}

export async function deleteSession(id: string): Promise<void> {
  await fetch(`${getBaseUrl()}/api/sessions/${id}`, { method: 'DELETE' });
}

export async function updateSessionLabel(id: string, label: string | null): Promise<void> {
  await fetch(`${getBaseUrl()}/api/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
}

export async function recordCurrentSession(rootSessionId?: string): Promise<string> {
  const res = await fetch(`${getBaseUrl()}/api/sessions/record-current`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rootSessionId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to record');
  }
  const data = await res.json();
  return data.sessionId;
}
