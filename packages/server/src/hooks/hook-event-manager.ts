import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { HookEvent, PermissionDecision, PermissionResponse, PendingPermission } from '@agent-move/shared';
import type { AgentStateManager } from '../state/agent-state-manager.js';

const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface DeferredPermission {
  resolve: (decision: PermissionDecision) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Processes Claude Code hook events and bridges them to AgentStateManager.
 * Also manages the blocking permission request flow (holds HTTP connections
 * open until a WS client approves or denies).
 *
 * Emits:
 *   'permission:request'  — a new permission request arrived (broadcast to WS clients)
 *   'permission:resolved' — a permission was resolved (broadcast to WS clients)
 */
export class HookEventManager extends EventEmitter {
  private pending = new Map<string, DeferredPermission>();

  constructor(private stateManager: AgentStateManager) {
    super();
  }

  /**
   * Main entry point for incoming hook events.
   *
   * - For PermissionRequest: returns a Promise that resolves when the user
   *   decides. Fastify holds the HTTP connection open while awaiting.
   * - For all other events: processes state updates and returns null immediately
   *   (fire-and-forget from the HTTP handler's perspective).
   */
  async handleEvent(event: HookEvent): Promise<{ body: object; statusCode: number } | null> {
    if (event.hook_event_name === 'PermissionRequest') {
      return this.handlePermissionRequest(event);
    }
    this.processLifecycleEvent(event);
    return null;
  }

  /**
   * Called by the WS handler when a client approves a permission.
   */
  resolvePermission(permissionId: string, decision: PermissionDecision): void {
    const deferred = this.pending.get(permissionId);
    if (!deferred) return;
    clearTimeout(deferred.timeout);
    this.pending.delete(permissionId);
    deferred.resolve(decision);
    this.emit('permission:resolved', { permissionId, decision: decision.behavior });
  }

  /** All currently pending permission requests (for sending on new WS connect) */
  getPendingPermissions(): PendingPermission[] {
    // We don't store the full PendingPermission here — the event was already broadcast.
    // This is fine; new clients miss in-flight permissions (they'll be resolved soon anyway).
    return [];
  }

  dispose(): void {
    for (const deferred of this.pending.values()) {
      clearTimeout(deferred.timeout);
    }
    this.pending.clear();
    this.removeAllListeners();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async handlePermissionRequest(
    event: HookEvent
  ): Promise<{ body: object; statusCode: number }> {
    const permissionId = randomUUID();
    const permission: PendingPermission = {
      permissionId,
      sessionId: event.session_id,
      toolName: event.tool_name ?? '',
      toolInput: event.tool_input ?? null,
      toolUseId: event.tool_use_id ?? '',
      permissionSuggestions: event.permission_suggestions,
      timestamp: Date.now(),
    };

    // Emit so Broadcaster can push permission:request to WS clients
    this.emit('permission:request', permission);

    return new Promise<{ body: object; statusCode: number }>((resolve) => {
      const timeout = setTimeout(() => {
        // Timed out — auto-deny to unblock Claude Code
        this.pending.delete(permissionId);
        this.emit('permission:resolved', { permissionId, decision: 'deny' });
        resolve({
          statusCode: 403,
          body: buildResponse({ behavior: 'deny' }),
        });
      }, PERMISSION_TIMEOUT_MS);

      this.pending.set(permissionId, {
        timeout,
        resolve: (decision: PermissionDecision) => {
          if (decision.behavior === 'deny') {
            resolve({ statusCode: 403, body: buildResponse(decision) });
          } else {
            resolve({ statusCode: 200, body: buildResponse(decision) });
          }
        },
      });
    });
  }

  private processLifecycleEvent(event: HookEvent): void {
    const { hook_event_name, session_id } = event;

    switch (hook_event_name) {
      case 'SessionStart':
        this.stateManager.hookSessionStart(session_id, event.cwd ?? '');
        break;

      case 'SessionEnd':
        this.stateManager.hookSessionEnd(session_id);
        break;

      case 'UserPromptSubmit':
        this.stateManager.hookUserPromptSubmit(session_id);
        break;

      case 'Stop':
        this.stateManager.hookStop(session_id, event.last_assistant_message);
        break;

      case 'PreCompact':
        this.stateManager.hookPreCompact(session_id);
        break;

      case 'PreToolUse':
        if (event.tool_name) {
          this.stateManager.hookPreToolUse(
            session_id,
            event.tool_name,
            event.tool_input,
            event.tool_use_id ?? ''
          );
        }
        break;

      case 'PostToolUse':
        if (event.tool_name) {
          this.stateManager.hookPostToolUse(
            session_id,
            event.tool_name,
            event.tool_use_id ?? '',
            true
          );
        }
        break;

      case 'PostToolUseFailure':
        if (event.tool_name) {
          this.stateManager.hookPostToolUse(
            session_id,
            event.tool_name,
            event.tool_use_id ?? '',
            false
          );
        }
        break;

      case 'TaskCompleted':
        if (event.task_id) {
          this.stateManager.hookTaskCompleted(session_id, event.task_id, event.task_subject);
        }
        break;

      case 'SubagentStart':
        // Subagent sessions will be picked up by JSONL watcher when they start writing.
        // The hook gives us a heads-up — useful for future subagent pre-registration.
        break;

      case 'SubagentStop':
        // Subagent ended — JSONL idle detection will also catch this,
        // but the hook makes it immediate.
        if (event.agent_id) {
          this.stateManager.hookSessionEnd(event.agent_id);
        }
        break;

      case 'Notification':
        // Notification events — could trigger UI notifications in the future
        break;

      case 'TeammateIdle':
        // Teammate agent is waiting for input in a multi-agent setup
        this.emit('teammate:idle', {
          sessionId: session_id,
          agentId: event.agent_id,
          message: event.message,
        });
        break;

      case 'WorktreeCreate':
        // Git worktree created — log for future visualization
        console.log(`[hook] Worktree created: session=${session_id}`);
        break;

      case 'WorktreeRemove':
        // Git worktree removed
        console.log(`[hook] Worktree removed: session=${session_id}`);
        break;

      default:
        break;
    }
  }
}

function buildResponse(decision: PermissionDecision): PermissionResponse {
  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision,
    },
  };
}
