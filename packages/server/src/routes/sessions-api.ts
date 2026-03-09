import type { FastifyInstance } from 'fastify';
import type { SessionRecorder } from '../storage/session-recorder.js';
import type { AgentStateManager } from '../state/agent-state-manager.js';

export function registerSessionRoutes(
  app: FastifyInstance,
  recorder: SessionRecorder,
  stateManager: AgentStateManager,
) {
  const store = recorder.getStore();

  /** List currently active (live) sessions */
  app.get('/api/sessions/live', async () => {
    return { sessions: store.listLiveSessions() };
  });

  /** List recorded sessions */
  app.get<{
    Querystring: { project?: string; limit?: string; offset?: string };
  }>('/api/sessions', async (req) => {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
    const sessions = store.listSessions({
      project: req.query.project,
      limit,
      offset,
    });
    const total = store.getSessionCount(req.query.project);
    return { sessions, total, limit, offset };
  });

  /** Get a single session (without timeline) */
  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    const session = store.getSession(req.params.id);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    return session;
  });

  /** Get timeline events for a session */
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string; offset?: string };
  }>('/api/sessions/:id/timeline', async (req, reply) => {
    const session = store.getSession(req.params.id);
    if (!session) return reply.status(404).send({ error: 'Session not found' });

    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10000;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
    const timeline = store.getTimeline(req.params.id, { limit, offset });
    return { timeline };
  });

  /** Compare two sessions */
  app.get<{
    Querystring: { a: string; b: string };
  }>('/api/sessions/compare', async (req, reply) => {
    const { a, b } = req.query;
    if (!a || !b) return reply.status(400).send({ error: 'Both ?a and ?b session IDs required' });

    const sessionA = store.getSession(a);
    const sessionB = store.getSession(b);
    if (!sessionA) return reply.status(404).send({ error: `Session ${a} not found` });
    if (!sessionB) return reply.status(404).send({ error: `Session ${b} not found` });

    const timelineA = store.getTimeline(a);
    const timelineB = store.getTimeline(b);

    return {
      sessionA: { ...sessionA, timeline: timelineA },
      sessionB: { ...sessionB, timeline: timelineB },
    };
  });

  /** Update session label */
  app.patch<{
    Params: { id: string };
    Body: { label?: string | null; tags?: string[] };
  }>('/api/sessions/:id', async (req, reply) => {
    const body = req.body as { label?: string | null; tags?: string[] };
    let updated = false;

    if (body.label !== undefined) {
      updated = store.updateLabel(req.params.id, body.label ?? null) || updated;
    }
    if (body.tags) {
      updated = store.updateTags(req.params.id, body.tags) || updated;
    }

    if (!updated) return reply.status(404).send({ error: 'Session not found' });
    return { ok: true };
  });

  /** Delete a session */
  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    const deleted = store.deleteSession(req.params.id);
    if (!deleted) return reply.status(404).send({ error: 'Session not found' });
    return { ok: true };
  });

  /** Manually record the currently active session */
  app.post<{
    Body: { rootSessionId?: string };
  }>('/api/sessions/record-current', async (req, reply) => {
    const body = req.body as { rootSessionId?: string } | null;

    // If no rootSessionId specified, try to find the active one
    let rootId = body?.rootSessionId;
    if (!rootId) {
      const agents = stateManager.getAll();
      if (agents.length === 0) {
        return reply.status(400).send({ error: 'No active agents' });
      }
      rootId = agents[0].rootSessionId;
    }

    const sessionId = recorder.recordCurrentSession(rootId);
    if (!sessionId) {
      return reply.status(400).send({ error: 'No session data to record' });
    }
    return { sessionId };
  });
}
