/**
 * Keyboard Shortcuts Help Overlay — triggered by pressing '?' key.
 * Shows all available keyboard shortcuts grouped by category.
 */

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'General',
    shortcuts: [
      { keys: '?', description: 'Toggle this help overlay' },
      { keys: 'Ctrl + K', description: 'Open command palette' },
      { keys: 'Esc', description: 'Close any open panel' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: 'Scroll', description: 'Zoom in / out' },
      { keys: 'Click + Drag', description: 'Pan the canvas' },
      { keys: '+  /  -', description: 'Zoom in / out' },
      { keys: '0', description: 'Reset camera to fit view' },
    ],
  },
  {
    title: 'Panels',
    shortcuts: [
      { keys: 'A', description: 'Toggle analytics panel' },
      { keys: 'H', description: 'Toggle activity heatmap' },
      { keys: 'E', description: 'Export session summary' },
      { keys: 'M', description: 'Toggle sound mute' },
    ],
  },
  {
    title: 'Camera & Focus',
    shortcuts: [
      { keys: 'F', description: 'Focus / cycle to next agent' },
      { keys: 'Esc', description: 'Exit focus mode' },
    ],
  },
  {
    title: 'Timeline',
    shortcuts: [
      { keys: 'Space', description: 'Play / pause timeline replay' },
    ],
  },
  {
    title: 'New Features',
    shortcuts: [
      { keys: 'T', description: 'Toggle agent trails' },
      { keys: 'N', description: 'Toggle day/night cycle' },
      { keys: '`', description: 'Toggle mini-map' },
      { keys: 'L', description: 'Toggle leaderboard' },
      { keys: 'P', description: 'Cycle theme' },
      { keys: 'C', description: 'Toggle tool chains panel' },
      { keys: 'G', description: 'Toggle task graph panel' },
      { keys: 'V', description: 'Toggle activity feed' },
      { keys: 'W', description: 'Toggle waterfall trace view' },
      { keys: 'R', description: 'Toggle agent relationship graph' },
      { keys: 'S', description: 'Open settings panel' },
    ],
  },
];

export class ShortcutsHelp {
  private el: HTMLElement;
  private isOpen = false;

  private globalKeydownHandler = (e: KeyboardEvent) => {
    // Don't trigger if typing in an input
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === '?') {
      e.preventDefault();
      this.toggle();
    }
    if (e.key === 'Escape' && this.isOpen) {
      e.preventDefault();
      this.close();
    }
  };

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'shortcuts-help';
    this.el.innerHTML = `
      <div class="sh-backdrop"></div>
      <div class="sh-modal">
        <div class="sh-header">
          <span class="sh-title">Keyboard Shortcuts</span>
          <button class="sh-close">&times;</button>
        </div>
        <div class="sh-body">
          ${SHORTCUT_GROUPS.map(group => `
            <div class="sh-group">
              <div class="sh-group-title">${group.title}</div>
              ${group.shortcuts.map(s => `
                <div class="sh-row">
                  <span class="sh-keys">${this.renderKeys(s.keys)}</span>
                  <span class="sh-desc">${s.description}</span>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
        <div class="sh-footer">Press <kbd>?</kbd> to close</div>
      </div>
    `;
    document.body.appendChild(this.el);

    // Events
    this.el.querySelector('.sh-backdrop')!.addEventListener('click', () => this.close());
    this.el.querySelector('.sh-close')!.addEventListener('click', () => this.close());
    document.addEventListener('keydown', this.globalKeydownHandler);
  }

  private renderKeys(keys: string): string {
    return keys.split(/\s*\+\s*|\s*\/\s*/).map(k => {
      const trimmed = k.trim();
      if (!trimmed) return '';
      return `<kbd>${trimmed}</kbd>`;
    }).filter(Boolean).join(keys.includes('+') ? ' + ' : ' / ');
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.isOpen = true;
    this.el.classList.add('open');
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.remove('open');
  }

  dispose(): void {
    document.removeEventListener('keydown', this.globalKeydownHandler);
    this.el.remove();
  }
}
