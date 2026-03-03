/**
 * Browser notifications for background tab alerts.
 * Only fires when the tab is not visible.
 */

export class NotificationManager {
  private _enabled = true;
  private permissionGranted = false;

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(v: boolean) {
    this._enabled = v;
  }

  /** Request notification permission. Call from user gesture. */
  async requestPermission(): Promise<void> {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      this.permissionGranted = true;
      return;
    }
    if (Notification.permission === 'denied') return;
    const result = await Notification.requestPermission();
    this.permissionGranted = result === 'granted';
  }

  notifySpawn(agentName: string): void {
    this.show('Agent Spawned', `${agentName} has entered the office`);
  }

  notifyShutdown(agentName: string): void {
    this.show('Agent Finished', `${agentName} has left the office`);
  }

  notifyIdle(agentName: string): void {
    this.show('Agent Idle', `${agentName} is now idle`);
  }

  private show(title: string, body: string): void {
    if (!this._enabled) return;
    if (!this.permissionGranted) return;
    if (document.visibilityState === 'visible') return;

    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        silent: true, // We have our own sounds
        tag: 'agent-move', // Replace previous notification
      });
    } catch {
      // Notifications not supported in this context
    }
  }
}
