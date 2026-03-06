import type { PendingPermission } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';

/**
 * PermissionPanel — floating panel that shows pending permission requests
 * from Claude Code hooks. Users can approve/deny tool execution from the UI.
 */
export class PermissionPanel {
  private container: HTMLElement;
  private store: StateStore;
  private permissions: PendingPermission[] = [];
  private onPermRequestBound: (perm: PendingPermission) => void;
  private onPermResolvedBound: (data: { permissionId: string }) => void;

  constructor(store: StateStore) {
    this.store = store;

    this.container = document.createElement('div');
    this.container.id = 'permission-panel';
    this.container.setAttribute('role', 'alertdialog');
    this.container.setAttribute('aria-label', 'Permission requests');
    document.body.appendChild(this.container);

    this.onPermRequestBound = (perm) => {
      this.permissions.push(perm);
      this.render();
    };
    this.onPermResolvedBound = ({ permissionId }) => {
      this.permissions = this.permissions.filter(p => p.permissionId !== permissionId);
      this.render();
    };
    store.on('permission:request', this.onPermRequestBound);
    store.on('permission:resolved', this.onPermResolvedBound);
  }

  private render(): void {
    if (this.permissions.length === 0) {
      this.container.classList.remove('visible');
      this.container.innerHTML = '';
      return;
    }

    this.container.classList.add('visible');

    let html = `<div class="perm-header">
      <span class="perm-badge">${this.permissions.length}</span>
      Permission Request${this.permissions.length > 1 ? 's' : ''}
    </div>`;

    for (const perm of this.permissions) {
      const isAsk = perm.toolName === 'AskUserQuestion';
      const isPlan = perm.toolName === 'ExitPlanMode';
      const elapsed = Math.round((Date.now() - perm.timestamp) / 1000);
      const elapsedStr = elapsed < 60 ? `${elapsed}s ago` : `${Math.round(elapsed / 60)}m ago`;

      html += `<div class="perm-card" data-id="${this.esc(perm.permissionId)}">`;
      html += `<div class="perm-tool">`;
      html += `<span class="perm-tool-name">${this.esc(perm.toolName)}</span>`;
      html += `<span class="perm-time">${elapsedStr}</span>`;
      html += `</div>`;

      // Show tool input preview
      if (isAsk) {
        html += this.renderAskQuestion(perm);
      } else if (isPlan) {
        html += this.renderPlanReview(perm);
      } else {
        html += this.renderToolInput(perm);
      }

      // Plan review feedback
      if (isPlan) {
        html += `<textarea class="perm-answer perm-feedback" placeholder="Optional feedback..." rows="2"></textarea>`;
      }

      // Action buttons
      html += `<div class="perm-actions">`;
      if (!isAsk && !isPlan && perm.permissionSuggestions?.length) {
        html += `<button class="perm-btn perm-always" data-action="always" data-id="${this.esc(perm.permissionId)}">Always Allow</button>`;
      }
      html += `<button class="perm-btn perm-approve" data-action="approve" data-id="${this.esc(perm.permissionId)}">Approve</button>`;
      html += `<button class="perm-btn perm-deny" data-action="deny" data-id="${this.esc(perm.permissionId)}">Deny</button>`;
      html += `</div>`;

      html += `</div>`;
    }

    this.container.innerHTML = html;
    this.wireActions();
  }

  private renderToolInput(perm: PendingPermission): string {
    const input = perm.toolInput;
    if (!input) return '';
    const obj = input as Record<string, unknown>;

    // Show the most relevant field
    const preview = (obj.command ?? obj.file_path ?? obj.pattern ?? obj.query ?? obj.url ?? obj.prompt) as string | undefined;
    if (preview) {
      const truncated = preview.length > 200 ? preview.slice(0, 197) + '...' : preview;
      return `<div class="perm-preview"><code>${this.esc(truncated)}</code></div>`;
    }

    const json = JSON.stringify(input, null, 2);
    const truncated = json.length > 300 ? json.slice(0, 297) + '...' : json;
    return `<div class="perm-preview"><code>${this.esc(truncated)}</code></div>`;
  }

  private renderAskQuestion(perm: PendingPermission): string {
    const input = perm.toolInput as Record<string, unknown> | null;
    if (!input) return '';

    const questions = input.questions as string[] | undefined;
    if (!questions?.length) return '';

    let html = '<div class="perm-question">';
    for (const q of questions) {
      html += `<p class="perm-q-text">${this.esc(q)}</p>`;
    }
    html += `<textarea class="perm-answer" placeholder="Type your answer..." rows="2"></textarea>`;
    html += '</div>';
    return html;
  }

  private renderPlanReview(perm: PendingPermission): string {
    const input = perm.toolInput as Record<string, unknown> | null;
    if (!input) return '<div class="perm-preview">Plan review requested</div>';

    const plan = (input.plan ?? input.content ?? '') as string;
    if (plan) {
      const truncated = plan.length > 500 ? plan.slice(0, 497) + '...' : plan;
      return `<div class="perm-preview perm-plan"><pre>${this.esc(truncated)}</pre></div>`;
    }
    return '<div class="perm-preview">Plan review requested</div>';
  }

  private wireActions(): void {
    this.container.querySelectorAll('.perm-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const el = e.currentTarget as HTMLElement;
        const action = el.dataset.action;
        const id = el.dataset.id!;
        const card = el.closest('.perm-card') as HTMLElement;

        if (action === 'approve') {
          // Check for AskUserQuestion answer
          const answerArea = card?.querySelector('.perm-answer:not(.perm-feedback)') as HTMLTextAreaElement | null;
          // Check for plan feedback
          const feedbackArea = card?.querySelector('.perm-feedback') as HTMLTextAreaElement | null;

          if (answerArea?.value) {
            this.store.approvePermission(id, { answer: answerArea.value });
          } else if (feedbackArea?.value) {
            this.store.approvePermission(id, { userFeedback: feedbackArea.value });
          } else {
            this.store.approvePermission(id);
          }
        } else if (action === 'deny') {
          this.store.denyPermission(id);
        } else if (action === 'always') {
          const perm = this.permissions.find(p => p.permissionId === id);
          const rules = perm?.permissionSuggestions ?? [];
          this.store.approvePermissionAlways(id, rules);
        }
      });
    });
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  dispose(): void {
    this.store.off('permission:request', this.onPermRequestBound);
    this.store.off('permission:resolved', this.onPermResolvedBound);
    this.container.remove();
  }
}
