/**
 * Onboarding Tooltip — shows a welcome overlay for first-time users.
 * Persists dismissal in localStorage so it only shows once.
 */

const STORAGE_KEY = 'agent-move:onboarding-dismissed';

export class Onboarding {
  private el: HTMLElement | null = null;

  constructor() {
    if (this.isDismissed()) return;
    this.show();
  }

  private isDismissed(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private dismiss(): void {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    if (this.el) {
      this.el.classList.add('ob-exit');
      setTimeout(() => this.el?.remove(), 400);
    }
  }

  private show(): void {
    this.el = document.createElement('div');
    this.el.id = 'onboarding';
    this.el.innerHTML = `
      <div class="ob-card">
        <div class="ob-header">
          <span class="ob-logo">AgentMove</span>
          <button class="ob-close">&times;</button>
        </div>
        <div class="ob-body">
          <p class="ob-desc">Real-time visualization of your Claude Code sessions.</p>
          <div class="ob-features">
            <div class="ob-feature">
              <span class="ob-icon">&#128187;</span>
              <div>
                <strong>Start a Claude Code session</strong>
                <span>Agents appear automatically as they work</span>
              </div>
            </div>
            <div class="ob-feature">
              <span class="ob-icon">&#9000;</span>
              <div>
                <strong>Press <kbd>?</kbd> for shortcuts</strong>
                <span>Quick keys for all features</span>
              </div>
            </div>
            <div class="ob-feature">
              <span class="ob-icon">&#128269;</span>
              <div>
                <strong>Press <kbd>Ctrl+K</kbd></strong>
                <span>Command palette to search anything</span>
              </div>
            </div>
            <div class="ob-feature">
              <span class="ob-icon">&#128202;</span>
              <div>
                <strong>Press <kbd>A</kbd> for analytics</strong>
                <span>Live cost tracking and token stats</span>
              </div>
            </div>
          </div>
        </div>
        <button class="ob-dismiss">Got it, let's go!</button>
      </div>
    `;
    document.body.appendChild(this.el);

    // Animate in
    requestAnimationFrame(() => this.el?.classList.add('ob-enter'));

    this.el.querySelector('.ob-close')!.addEventListener('click', () => this.dismiss());
    this.el.querySelector('.ob-dismiss')!.addEventListener('click', () => this.dismiss());

    // Also dismiss on any click outside the card
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.dismiss();
    });
  }

  dispose(): void {
    this.el?.remove();
  }
}
