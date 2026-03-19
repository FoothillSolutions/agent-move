import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScreenshotExport } from './screenshot-export.js';

// ── Mocks ──────────────────────────────────────────────────────────────────────

function createMockApp() {
  const canvas = document.createElement('canvas');
  // Mock toBlob — calls callback with a real Blob asynchronously
  canvas.toBlob = vi.fn((cb: BlobCallback, _type?: string) => {
    setTimeout(() => cb(new Blob(['png-data'], { type: 'image/png' })), 0);
  });

  return {
    canvas,
    render: vi.fn(),
  } as any;
}

function createMockWorld() {
  return {
    camera: {
      getZoom: vi.fn().mockReturnValue(1),
      setZoom: vi.fn(),
      resetView: vi.fn(),
    },
    root: {
      position: { x: 0, y: 0, set: vi.fn() },
    },
    worldWidth: 2520,
    worldHeight: 2520,
  } as any;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function query(sse: ScreenshotExport, sel: string): HTMLElement {
  // Access the private `el` via bracket notation for testing
  const el = (sse as any).el as HTMLElement;
  return el.querySelector(sel) as HTMLElement;
}

function allQuery(sse: ScreenshotExport, sel: string): NodeListOf<HTMLElement> {
  const el = (sse as any).el as HTMLElement;
  return el.querySelectorAll(sel);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ScreenshotExport', () => {
  let sse: ScreenshotExport;
  let mockApp: ReturnType<typeof createMockApp>;
  let mockWorld: ReturnType<typeof createMockWorld>;

  beforeEach(() => {
    mockApp = createMockApp();
    mockWorld = createMockWorld();
    sse = new ScreenshotExport(mockApp, mockWorld);
  });

  afterEach(() => {
    sse.dispose();
  });

  // ── DOM Structure ──────────────────────────────────────────────────────────

  describe('DOM structure', () => {
    it('appends root element to document.body', () => {
      const el = document.getElementById('screenshot-export');
      expect(el).not.toBeNull();
    });

    it('has backdrop, modal, header, body, and footer', () => {
      expect(query(sse, '.sse-backdrop')).not.toBeNull();
      expect(query(sse, '.sse-modal')).not.toBeNull();
      expect(query(sse, '.sse-header')).not.toBeNull();
      expect(query(sse, '.sse-body')).not.toBeNull();
      expect(query(sse, '.sse-footer')).not.toBeNull();
    });

    it('has title "Screenshot Export"', () => {
      expect(query(sse, '.sse-title').textContent).toBe('Screenshot Export');
    });

    it('has viewport and full-world mode toggle buttons', () => {
      const buttons = allQuery(sse, '.sse-mode-btn');
      expect(buttons).toHaveLength(2);
      expect(buttons[0].dataset.mode).toBe('viewport');
      expect(buttons[1].dataset.mode).toBe('full-world');
    });

    it('has close, copy, and download buttons', () => {
      expect(query(sse, '.sse-close')).not.toBeNull();
      expect(query(sse, '.sse-copy-btn')).not.toBeNull();
      expect(query(sse, '.sse-download-btn')).not.toBeNull();
    });

    it('has preview image and loading indicator', () => {
      expect(query(sse, '.sse-preview-img')).not.toBeNull();
      expect(query(sse, '.sse-loading')).not.toBeNull();
    });
  });

  // ── Open / Close / Toggle ─────────────────────────────────────────────────

  describe('open / close / toggle', () => {
    it('starts closed', () => {
      const el = (sse as any).el as HTMLElement;
      expect(el.classList.contains('open')).toBe(false);
      expect((sse as any).isOpen).toBe(false);
    });

    it('open() adds .open class and sets isOpen', () => {
      sse.open();
      const el = (sse as any).el as HTMLElement;
      expect(el.classList.contains('open')).toBe(true);
      expect((sse as any).isOpen).toBe(true);
    });

    it('open() resets to viewport mode', () => {
      // Manually set to full-world
      (sse as any).currentMode = 'full-world';
      sse.open();
      expect((sse as any).currentMode).toBe('viewport');
    });

    it('open() triggers a capture (calls canvas.toBlob)', () => {
      sse.open();
      expect(mockApp.canvas.toBlob).toHaveBeenCalled();
    });

    it('close() removes .open class and clears state', () => {
      sse.open();
      sse.close();
      const el = (sse as any).el as HTMLElement;
      expect(el.classList.contains('open')).toBe(false);
      expect((sse as any).isOpen).toBe(false);
      expect((sse as any).currentBlob).toBeNull();
    });

    it('close() clears the preview image src', () => {
      sse.open();
      sse.close();
      const img = query(sse, '.sse-preview-img') as HTMLImageElement;
      // jsdom resolves empty string to base URL, so check getAttribute
      expect(img.getAttribute('src')).toBe('');
    });

    it('toggle() opens when closed', () => {
      sse.toggle();
      expect((sse as any).isOpen).toBe(true);
    });

    it('toggle() closes when open', () => {
      sse.open();
      sse.toggle();
      expect((sse as any).isOpen).toBe(false);
    });
  });

  // ── Capture Modes ──────────────────────────────────────────────────────────

  describe('capture modes', () => {
    it('viewport capture calls canvas.toBlob with image/png', async () => {
      sse.open();
      // Wait for the async toBlob callback
      await vi.waitFor(() => {
        expect(mockApp.canvas.toBlob).toHaveBeenCalledWith(
          expect.any(Function),
          'image/png',
        );
      });
    });

    it('viewport capture stores the blob', async () => {
      sse.open();
      await vi.waitFor(() => {
        expect((sse as any).currentBlob).toBeInstanceOf(Blob);
      });
    });

    it('full-world capture saves and restores camera state', async () => {
      // Mock requestAnimationFrame for full-world capture
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        cb(0);
        return 0;
      });

      mockWorld.camera.getZoom.mockReturnValue(1.5);
      mockWorld.root.position.x = 100;
      mockWorld.root.position.y = 200;

      sse.open();
      // Switch to full-world mode
      const fullBtn = allQuery(sse, '.sse-mode-btn')[1];
      fullBtn.click();

      await vi.waitFor(() => {
        expect(mockWorld.camera.resetView).toHaveBeenCalledWith(2520, 2520);
      });

      await vi.waitFor(() => {
        expect(mockWorld.camera.setZoom).toHaveBeenCalledWith(1.5);
        expect(mockWorld.root.position.set).toHaveBeenCalledWith(100, 200);
      });

      vi.restoreAllMocks();
    });

    it('full-world capture forces a render', async () => {
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        cb(0);
        return 0;
      });

      sse.open();
      const fullBtn = allQuery(sse, '.sse-mode-btn')[1];
      fullBtn.click();

      await vi.waitFor(() => {
        expect(mockApp.render).toHaveBeenCalled();
      });

      vi.restoreAllMocks();
    });

    it('mode toggle updates active button class', () => {
      sse.open();
      const buttons = allQuery(sse, '.sse-mode-btn');

      // Initially viewport is active
      expect(buttons[0].classList.contains('active')).toBe(true);
      expect(buttons[1].classList.contains('active')).toBe(false);

      // Click full-world
      buttons[1].click();
      expect(buttons[0].classList.contains('active')).toBe(false);
      expect(buttons[1].classList.contains('active')).toBe(true);
    });

    it('clicking the already-active mode does not re-capture', () => {
      sse.open();
      const callCount = (mockApp.canvas.toBlob as any).mock.calls.length;

      // Click viewport again (already active)
      const viewportBtn = allQuery(sse, '.sse-mode-btn')[0];
      viewportBtn.click();

      // Should not have triggered another capture
      expect((mockApp.canvas.toBlob as any).mock.calls.length).toBe(callCount);
    });
  });

  // ── Download ───────────────────────────────────────────────────────────────

  describe('download', () => {
    it('creates a download link with correct filename pattern', async () => {
      // Set up a blob
      (sse as any).currentBlob = new Blob(['data'], { type: 'image/png' });
      (sse as any).currentMode = 'viewport';

      const createElementSpy = vi.spyOn(document, 'createElement');
      const mockAnchor = document.createElement('a');
      mockAnchor.click = vi.fn();
      createElementSpy.mockReturnValueOnce(mockAnchor);

      // Trigger download
      (sse as any).download();

      expect(mockAnchor.download).toMatch(/^agent-move-screenshot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.png$/);
      expect(mockAnchor.click).toHaveBeenCalled();

      createElementSpy.mockRestore();
    });

    it('appends -full suffix for full-world mode', () => {
      (sse as any).currentBlob = new Blob(['data'], { type: 'image/png' });
      (sse as any).currentMode = 'full-world';

      const createElementSpy = vi.spyOn(document, 'createElement');
      const mockAnchor = document.createElement('a');
      mockAnchor.click = vi.fn();
      createElementSpy.mockReturnValueOnce(mockAnchor);

      (sse as any).download();

      expect(mockAnchor.download).toMatch(/^agent-move-screenshot-full-/);

      createElementSpy.mockRestore();
    });

    it('does nothing if no blob is captured', () => {
      (sse as any).currentBlob = null;
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL');

      (sse as any).download();

      expect(createObjectURLSpy).not.toHaveBeenCalled();
      createObjectURLSpy.mockRestore();
    });

    it('shows "Downloaded!" feedback on button', async () => {
      (sse as any).currentBlob = new Blob(['data'], { type: 'image/png' });

      const mockAnchor = document.createElement('a');
      mockAnchor.click = vi.fn();
      vi.spyOn(document, 'createElement').mockReturnValueOnce(mockAnchor);

      (sse as any).download();

      const btn = query(sse, '.sse-download-btn');
      expect(btn.textContent).toBe('Downloaded!');

      vi.restoreAllMocks();
    });
  });

  // ── Copy to Clipboard ──────────────────────────────────────────────────────

  describe('copyToClipboard', () => {
    it('calls navigator.clipboard.write with ClipboardItem', async () => {
      (sse as any).currentBlob = new Blob(['data'], { type: 'image/png' });

      const writeMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: writeMock },
        writable: true,
        configurable: true,
      });

      // Mock ClipboardItem as a proper class (jsdom doesn't provide it)
      const origClipboardItem = globalThis.ClipboardItem;
      class MockClipboardItem {
        constructor(public items: Record<string, Blob>) {}
      }
      globalThis.ClipboardItem = MockClipboardItem as any;

      await (sse as any).copyToClipboard();

      expect(writeMock).toHaveBeenCalled();
      const arg = writeMock.mock.calls[0][0];
      expect(arg).toHaveLength(1);
      expect(arg[0]).toBeInstanceOf(MockClipboardItem);
      expect(arg[0].items['image/png']).toBeInstanceOf(Blob);

      const btn = query(sse, '.sse-copy-btn');
      expect(btn.textContent).toBe('Copied!');

      globalThis.ClipboardItem = origClipboardItem;
    });

    it('does nothing if no blob is captured', async () => {
      (sse as any).currentBlob = null;

      const writeMock = vi.fn();
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: writeMock },
        writable: true,
        configurable: true,
      });

      await (sse as any).copyToClipboard();

      expect(writeMock).not.toHaveBeenCalled();
    });

    it('falls back to window.open on clipboard failure', async () => {
      (sse as any).currentBlob = new Blob(['data'], { type: 'image/png' });

      Object.defineProperty(navigator, 'clipboard', {
        value: { write: vi.fn().mockRejectedValue(new Error('denied')) },
        writable: true,
        configurable: true,
      });

      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

      await (sse as any).copyToClipboard();

      expect(openSpy).toHaveBeenCalledWith(expect.any(String), '_blank');

      const btn = query(sse, '.sse-copy-btn');
      expect(btn.textContent).toBe('Opened in new tab');

      openSpy.mockRestore();
    });
  });

  // ── Close Triggers ─────────────────────────────────────────────────────────

  describe('close triggers', () => {
    it('clicking backdrop closes the modal', () => {
      sse.open();
      query(sse, '.sse-backdrop').click();
      expect((sse as any).isOpen).toBe(false);
    });

    it('clicking close button closes the modal', () => {
      sse.open();
      query(sse, '.sse-close').click();
      expect((sse as any).isOpen).toBe(false);
    });
  });

  // ── Dispose ────────────────────────────────────────────────────────────────

  describe('dispose', () => {
    it('removes the element from the DOM', () => {
      expect(document.getElementById('screenshot-export')).not.toBeNull();
      sse.dispose();
      expect(document.getElementById('screenshot-export')).toBeNull();
    });
  });

  // ── Preview image display ──────────────────────────────────────────────────

  describe('preview', () => {
    it('shows loading state during capture', () => {
      // Before open, loading should not be visible (display style not set initially by DOM)
      sse.open();
      // During capture, loading should be flex and img hidden
      const loading = query(sse, '.sse-loading');
      const img = query(sse, '.sse-preview-img');
      // At the point of capture start, img is hidden
      expect(img.style.display).toBe('none');
    });

    it('shows preview image after capture completes', async () => {
      sse.open();
      await vi.waitFor(() => {
        const img = query(sse, '.sse-preview-img') as HTMLImageElement;
        expect(img.style.display).toBe('block');
        expect(img.src).not.toBe('');
      });
    });

    it('hides loading indicator after capture completes', async () => {
      sse.open();
      await vi.waitFor(() => {
        const loading = query(sse, '.sse-loading');
        expect(loading.style.display).toBe('none');
      });
    });
  });
});
