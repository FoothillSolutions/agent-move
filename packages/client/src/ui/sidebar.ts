import type { NavTab } from './top-bar.js';

export class Sidebar {
  private activeTab: NavTab = 'monitor';
  private collapsed = false;
  private onTabChange: ((tab: NavTab) => void) | null = null;
  private el: HTMLElement;
  private toggleBtn: HTMLElement;

  constructor() {
    this.el = document.getElementById('sidebar')!;
    this.toggleBtn = document.getElementById('sb-toggle')!;

    // Restore collapsed state
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') {
      this.collapsed = true;
      this.el.classList.add('collapsed');
      document.documentElement.style.setProperty('--sidebar-nav-width', '52px');
    }

    // Toggle collapse
    this.toggleBtn.addEventListener('click', () => this.toggle());

    // Nav items
    this.el.querySelectorAll('.sb-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = (item as HTMLElement).dataset.tab as NavTab;
        this.setActiveTab(tab);
      });
    });
  }

  setTabChangeHandler(handler: (tab: NavTab) => void): void {
    this.onTabChange = handler;
  }

  getActiveTab(): NavTab {
    return this.activeTab;
  }

  setActiveTab(tab: NavTab): void {
    if (tab === this.activeTab && tab !== 'monitor') {
      this.activeTab = 'monitor';
      this.updateUI();
      this.onTabChange?.('monitor');
      return;
    }
    this.activeTab = tab;
    this.updateUI();
    this.onTabChange?.(tab);
  }

  toggle(): void {
    this.collapsed = !this.collapsed;
    this.el.classList.toggle('collapsed', this.collapsed);
    document.documentElement.style.setProperty(
      '--sidebar-nav-width',
      this.collapsed ? '52px' : '200px'
    );
    localStorage.setItem('sidebar-collapsed', String(this.collapsed));
  }

  private updateUI(): void {
    this.el.querySelectorAll('.sb-item').forEach(el => {
      const t = (el as HTMLElement).dataset.tab;
      el.classList.toggle('active', t === this.activeTab);
    });
  }
}
