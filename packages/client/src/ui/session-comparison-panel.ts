import type { RecordedSession, RecordedTimelineEvent, RecordedAgent, SessionComparison } from '@agent-move/shared';
import { FILE_WRITE_TOOLS, FILE_READ_TOOLS } from '@agent-move/shared';
import { escapeHtml, formatDuration, formatTokens, resolveAgentName } from '../utils/formatting.js';
import { fetchComparison } from '../connection/session-api.js';

type SessionWithTimeline = RecordedSession & { timeline: RecordedTimelineEvent[] };

interface FileInfo {
  path: string;
  readCount: number;
  writeCount: number;
}

/**
 * Session Comparison Panel — full-screen modal with true side-by-side layout.
 * Every section shows Session A on the left, Session B on the right.
 */
export class SessionComparisonPanel {
  private el: HTMLElement;
  private bodyEl: HTMLElement;
  private isOpen = false;
  private comparison: SessionComparison | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'session-comparison';
    this.el.innerHTML = `
      <div class="scm-backdrop"></div>
      <div class="scm-modal">
        <div class="scm-header">
          <span class="scm-title">Session Comparison</span>
          <div class="scm-header-labels"></div>
          <button class="scm-close">&times;</button>
        </div>
        <div class="scm-body"></div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.bodyEl = this.el.querySelector('.scm-body')!;

    this.el.querySelector('.scm-backdrop')!.addEventListener('click', () => this.close());
    this.el.querySelector('.scm-close')!.addEventListener('click', () => this.close());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  async open(idA: string, idB: string): Promise<void> {
    this.isOpen = true;
    this.comparison = null;
    this.el.classList.add('open');
    this.bodyEl.innerHTML = '<div class="scm-loading">Loading comparison...</div>';
    this.el.querySelector('.scm-header-labels')!.innerHTML = '';

    try {
      this.comparison = await fetchComparison(idA, idB);
      this.render();
    } catch (err) {
      console.error('Failed to load comparison:', err);
      this.bodyEl.innerHTML = '<div class="scm-loading">Failed to load comparison.</div>';
    }
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.remove('open');
  }

  private render(): void {
    if (!this.comparison) return;

    const a = this.comparison.sessionA;
    const b = this.comparison.sessionB;

    const labelA = a.label || a.projectName;
    const labelB = b.label || b.projectName;
    const srcA = a.source === 'opencode' ? 'OpenCode' : 'Claude Code';
    const srcB = b.source === 'opencode' ? 'OpenCode' : 'Claude Code';

    // Update header labels
    this.el.querySelector('.scm-header-labels')!.innerHTML = `
      <div class="scm-label scm-label-a">
        <span class="sc-dot sc-dot-a"></span>
        A: ${escapeHtml(labelA)}
        <span class="sc-source">${srcA}</span>
      </div>
      <span class="scm-vs">vs</span>
      <div class="scm-label scm-label-b">
        <span class="sc-dot sc-dot-b"></span>
        B: ${escapeHtml(labelB)}
        <span class="sc-source">${srcB}</span>
      </div>
    `;

    this.bodyEl.innerHTML = `
      ${this.renderSideBySideOverview(a, b)}
      ${this.renderSideBySideAgents(a, b)}
      ${this.renderSideBySideToolUsage(a, b)}
      ${this.renderSideBySideFiles(a, b)}
      ${this.renderSideBySideToolSequence(a, b)}
    `;
  }

  // ─── Side-by-side Overview ─────────────────────────────────────────────────

  private renderSideBySideOverview(a: SessionWithTimeline, b: SessionWithTimeline): string {
    const allInputA = a.totalInputTokens + a.totalCacheReadTokens;
    const allInputB = b.totalInputTokens + b.totalCacheReadTokens;
    const cacheRateA = allInputA > 0 ? (a.totalCacheReadTokens / allInputA) * 100 : 0;
    const cacheRateB = allInputB > 0 ? (b.totalCacheReadTokens / allInputB) * 100 : 0;
    const costPerMinA = a.durationMs > 0 ? a.totalCost / (a.durationMs / 60_000) : 0;
    const costPerMinB = b.durationMs > 0 ? b.totalCost / (b.durationMs / 60_000) : 0;

    const rows = [
      { label: 'Duration', vA: formatDuration(a.durationMs), vB: formatDuration(b.durationMs), delta: this.pctDelta(a.durationMs, b.durationMs), low: true },
      { label: 'Total Cost', vA: `$${a.totalCost.toFixed(3)}`, vB: `$${b.totalCost.toFixed(3)}`, delta: this.pctDelta(a.totalCost, b.totalCost), low: true },
      { label: 'Cost/min', vA: `$${costPerMinA.toFixed(4)}`, vB: `$${costPerMinB.toFixed(4)}`, delta: this.pctDelta(costPerMinA, costPerMinB), low: true },
      { label: 'Tool Uses', vA: String(a.totalToolUses), vB: String(b.totalToolUses), delta: this.pctDelta(a.totalToolUses, b.totalToolUses), low: true },
      { label: 'Input Tokens', vA: formatTokens(a.totalInputTokens), vB: formatTokens(b.totalInputTokens), delta: this.pctDelta(a.totalInputTokens, b.totalInputTokens), low: true },
      { label: 'Output Tokens', vA: formatTokens(a.totalOutputTokens), vB: formatTokens(b.totalOutputTokens), delta: this.pctDelta(a.totalOutputTokens, b.totalOutputTokens), low: true },
      { label: 'Cache Read', vA: formatTokens(a.totalCacheReadTokens), vB: formatTokens(b.totalCacheReadTokens), delta: this.pctDelta(a.totalCacheReadTokens, b.totalCacheReadTokens), low: false },
      { label: 'Cache Hit %', vA: `${cacheRateA.toFixed(1)}%`, vB: `${cacheRateB.toFixed(1)}%`, delta: this.pctDelta(cacheRateA, cacheRateB), low: false },
      { label: 'Agents', vA: String(a.agentCount), vB: String(b.agentCount), delta: this.pctDelta(a.agentCount, b.agentCount), low: false },
      { label: 'Model', vA: a.model || '-', vB: b.model || '-', delta: NaN, low: false },
    ];

    return `
      <div class="sc-section">
        <div class="sc-section-title">Overview</div>
        <table class="sc-table">
          <thead>
            <tr><th>Metric</th><th class="sc-th-a">Session A</th><th class="sc-th-delta"></th><th class="sc-th-b">Session B</th></tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td class="sc-td-label">${r.label}</td>
                <td class="sc-td-a">${r.label === 'Model' ? escapeHtml(r.vA) : r.vA}</td>
                <td class="sc-td-delta">${isNaN(r.delta) ? '' : `<span class="sc-delta ${this.deltaClass(r.delta, r.low)}">${this.formatDelta(r.delta)}</span>`}</td>
                <td class="sc-td-b">${r.label === 'Model' ? escapeHtml(r.vB) : r.vB}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ─── Side-by-side Agents ───────────────────────────────────────────────────

  private renderSideBySideAgents(a: SessionWithTimeline, b: SessionWithTimeline): string {
    if (a.agents.length === 0 && b.agents.length === 0) return '';

    const renderAgent = (ag: RecordedAgent): string => `
      <div class="sc-agent-card">
        <div class="sc-agent-name">${escapeHtml(resolveAgentName(ag))}</div>
        <div class="sc-agent-model">${ag.model ? escapeHtml(ag.model) : ''}</div>
        <div class="sc-agent-grid">
          <span class="sc-ag-label">Cost</span><span class="sc-ag-val">$${ag.cost.toFixed(3)}</span>
          <span class="sc-ag-label">Tools</span><span class="sc-ag-val">${ag.toolUseCount}</span>
          <span class="sc-ag-label">Tokens</span><span class="sc-ag-val">${formatTokens(ag.totalInputTokens)} in / ${formatTokens(ag.totalOutputTokens)} out</span>
          <span class="sc-ag-label">Duration</span><span class="sc-ag-val">${formatDuration(ag.endedAt - ag.spawnedAt)}</span>
          <span class="sc-ag-label">Cache</span><span class="sc-ag-val">${formatTokens(ag.cacheReadTokens)} read</span>
        </div>
      </div>
    `;

    const maxLen = Math.max(a.agents.length, b.agents.length);
    const agentRows = Array.from({ length: maxLen }, (_, i) => `
      <div class="sc-split-row">
        <div class="sc-split-left">${a.agents[i] ? renderAgent(a.agents[i]) : '<div class="sc-empty-cell">-</div>'}</div>
        <div class="sc-split-right">${b.agents[i] ? renderAgent(b.agents[i]) : '<div class="sc-empty-cell">-</div>'}</div>
      </div>
    `).join('');

    return `
      <div class="sc-section">
        <div class="sc-section-title">Agents</div>
        <div class="sc-split-header">
          <div class="sc-split-left sc-col-header sc-col-a">Session A (${a.agents.length})</div>
          <div class="sc-split-right sc-col-header sc-col-b">Session B (${b.agents.length})</div>
        </div>
        ${agentRows}
      </div>
    `;
  }

  // ─── Side-by-side Tool Usage Bars ──────────────────────────────────────────

  private renderSideBySideToolUsage(a: SessionWithTimeline, b: SessionWithTimeline): string {
    const aCounts = a.toolChain?.toolCounts ?? {};
    const bCounts = b.toolChain?.toolCounts ?? {};
    const allTools = new Set([...Object.keys(aCounts), ...Object.keys(bCounts)]);
    const toolData = [...allTools].map(tool => ({
      tool,
      countA: aCounts[tool] ?? 0,
      countB: bCounts[tool] ?? 0,
    })).sort((x, y) => (y.countA + y.countB) - (x.countA + x.countB));

    if (toolData.length === 0) return '';
    const maxCount = Math.max(...toolData.map(t => Math.max(t.countA, t.countB)), 1);

    return `
      <div class="sc-section">
        <div class="sc-section-title">Tool Usage</div>
        <div class="sc-tool-table">
          ${toolData.map(t => {
            const pctA = (t.countA / maxCount) * 100;
            const pctB = (t.countB / maxCount) * 100;
            const onlyA = t.countB === 0 && t.countA > 0;
            const onlyB = t.countA === 0 && t.countB > 0;
            const tag = onlyA ? '<span class="sc-unique sc-unique-a">A</span>'
              : onlyB ? '<span class="sc-unique sc-unique-b">B</span>' : '';
            const delta = this.pctDelta(t.countA, t.countB);

            return `
              <div class="sc-tool-cmp-row">
                <div class="sc-tool-cmp-bar sc-tool-cmp-bar-a">
                  <span class="sc-tool-cmp-count">${t.countA}</span>
                  <div class="sc-tool-cmp-fill sc-bar-a" style="width:${Math.max(1, pctA)}%"></div>
                </div>
                <div class="sc-tool-cmp-name">${escapeHtml(this.shortenToolName(t.tool))} ${tag}</div>
                <div class="sc-tool-cmp-bar sc-tool-cmp-bar-b">
                  <div class="sc-tool-cmp-fill sc-bar-b" style="width:${Math.max(1, pctB)}%"></div>
                  <span class="sc-tool-cmp-count">${t.countB}</span>
                </div>
                <span class="sc-delta sc-tool-cmp-delta ${this.deltaClass(delta, true)}">${this.formatDelta(delta)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }


  // ─── Side-by-side Files Changed ────────────────────────────────────────────

  private renderSideBySideFiles(a: SessionWithTimeline, b: SessionWithTimeline): string {
    const extractFiles = (timeline: RecordedTimelineEvent[]): FileInfo[] => {
      const fileMap = new Map<string, FileInfo>();
      for (const e of timeline) {
        if (e.kind !== 'tool' || !e.tool || !e.toolArgs) continue;
        // Extract file path from toolArgs (first arg is usually a file path)
        const args = e.toolArgs;
        let filePath: string | null = null;

        // Common patterns: absolute paths, or file_path/path arguments
        const pathMatch = args.match(/^([A-Za-z]:[/\\][^\s,]+|\/[^\s,]+)/);
        if (pathMatch) {
          filePath = pathMatch[1].replace(/\\/g, '/');
        }

        if (!filePath) continue;

        // Shorten to relative path
        const shortPath = this.shortenPath(filePath);
        const existing = fileMap.get(shortPath) ?? { path: shortPath, readCount: 0, writeCount: 0 };

        if (FILE_WRITE_TOOLS.has(e.tool)) {
          existing.writeCount++;
        } else if (FILE_READ_TOOLS.has(e.tool)) {
          existing.readCount++;
        } else {
          existing.readCount++;
        }

        fileMap.set(shortPath, existing);
      }

      return [...fileMap.values()].sort((x, y) => (y.writeCount + y.readCount) - (x.writeCount + x.readCount));
    };

    const filesA = extractFiles(a.timeline);
    const filesB = extractFiles(b.timeline);

    if (filesA.length === 0 && filesB.length === 0) return '';

    // Find shared, A-only, B-only files
    const pathsA = new Set(filesA.map(f => f.path));
    const pathsB = new Set(filesB.map(f => f.path));
    const shared = filesA.filter(f => pathsB.has(f.path));
    const onlyA = filesA.filter(f => !pathsB.has(f.path));
    const onlyB = filesB.filter(f => !pathsA.has(f.path));

    const writesA = filesA.filter(f => f.writeCount > 0);
    const writesB = filesB.filter(f => f.writeCount > 0);

    const renderFileList = (files: FileInfo[], max: number): string => {
      if (files.length === 0) return '<div class="sc-empty-cell">No files</div>';
      return `
        <div class="sc-file-list">
          ${files.slice(0, max).map(f => `
            <div class="sc-file-item">
              <span class="sc-file-icon">${f.writeCount > 0 ? 'W' : 'R'}</span>
              <span class="sc-file-path" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</span>
              <span class="sc-file-counts">${f.writeCount > 0 ? `${f.writeCount}w` : ''}${f.readCount > 0 ? ` ${f.readCount}r` : ''}</span>
            </div>
          `).join('')}
          ${files.length > max ? `<div class="sc-call-more">+${files.length - max} more</div>` : ''}
        </div>
      `;
    };

    return `
      <div class="sc-section">
        <div class="sc-section-title">Files Touched</div>
        <div class="sc-file-summary">
          <span>A: <strong>${writesA.length}</strong> written, <strong>${filesA.length}</strong> total</span>
          <span class="sc-file-shared">${shared.length} shared files</span>
          <span>B: <strong>${writesB.length}</strong> written, <strong>${filesB.length}</strong> total</span>
        </div>
        <div class="sc-split-header">
          <div class="sc-split-left sc-col-header sc-col-a">Session A files</div>
          <div class="sc-split-right sc-col-header sc-col-b">Session B files</div>
        </div>
        <div class="sc-split-row">
          <div class="sc-split-left">${renderFileList(filesA, 20)}</div>
          <div class="sc-split-right">${renderFileList(filesB, 20)}</div>
        </div>
        ${onlyA.length > 0 || onlyB.length > 0 ? `
          <div class="sc-file-diff-header">Unique files</div>
          <div class="sc-split-row">
            <div class="sc-split-left">${onlyA.length > 0 ? renderFileList(onlyA, 10) : '<div class="sc-empty-cell">None unique to A</div>'}</div>
            <div class="sc-split-right">${onlyB.length > 0 ? renderFileList(onlyB, 10) : '<div class="sc-empty-cell">None unique to B</div>'}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ─── Side-by-side Tool Sequence ────────────────────────────────────────────

  private renderSideBySideToolSequence(a: SessionWithTimeline, b: SessionWithTimeline): string {
    const getSeq = (timeline: RecordedTimelineEvent[]): Array<{ tool: string; args: string }> =>
      timeline
        .filter(e => e.kind === 'tool' && e.tool)
        .map(e => ({ tool: e.tool!, args: e.toolArgs || '' }));

    const seqA = getSeq(a.timeline);
    const seqB = getSeq(b.timeline);

    if (seqA.length === 0 && seqB.length === 0) return '';

    const maxShow = 50;
    const renderSeq = (seq: Array<{ tool: string; args: string }>): string => {
      const shown = seq.slice(0, maxShow);
      return `
        <div class="sc-seq-list">
          ${shown.map((s, i) => {
            const shortArgs = s.args.length > 50 ? s.args.slice(0, 47) + '...' : s.args;
            return `
              <div class="sc-seq-row" title="${escapeHtml(s.args)}">
                <span class="sc-seq-num">${i + 1}</span>
                <span class="sc-seq-tool">${escapeHtml(this.shortenToolName(s.tool))}</span>
                <span class="sc-seq-args">${escapeHtml(shortArgs)}</span>
              </div>
            `;
          }).join('')}
          ${seq.length > maxShow ? `<div class="sc-call-more">+${seq.length - maxShow} more</div>` : ''}
          <div class="sc-seq-total">${seq.length} total calls</div>
        </div>
      `;
    };

    return `
      <div class="sc-section">
        <div class="sc-section-title">Tool Sequence</div>
        <div class="sc-split-header">
          <div class="sc-split-left sc-col-header sc-col-a">Session A (${seqA.length} calls)</div>
          <div class="sc-split-right sc-col-header sc-col-b">Session B (${seqB.length} calls)</div>
        </div>
        <div class="sc-split-row sc-split-row-scroll">
          <div class="sc-split-left">${renderSeq(seqA)}</div>
          <div class="sc-split-right">${renderSeq(seqB)}</div>
        </div>
      </div>
    `;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private shortenToolName(tool: string): string {
    if (tool.startsWith('mcp__')) {
      const parts = tool.slice(5).split('__');
      if (parts.length >= 2) {
        return `${parts.slice(0, -1).join('/')}.${parts[parts.length - 1]}`;
      }
    }
    return tool;
  }

  private shortenPath(path: string): string {
    // Remove common prefixes
    const normalized = path.replace(/\\/g, '/');
    const match = normalized.match(/\/packages\/(.+)/) || normalized.match(/\/src\/(.+)/);
    if (match) return match[0];
    // Just take last 3 segments
    const parts = normalized.split('/');
    return parts.length > 3 ? '.../' + parts.slice(-3).join('/') : normalized;
  }

  private pctDelta(valA: number, valB: number): number {
    if (valA === 0 && valB === 0) return 0;
    if (valA === 0) return 100;
    return ((valB - valA) / valA) * 100;
  }

  private formatDelta(pct: number): string {
    if (Math.abs(pct) < 0.5) return '=';
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(0)}%`;
  }

  private deltaClass(pct: number, lowerBetter: boolean): string {
    if (Math.abs(pct) < 5) return 'sc-delta-neutral';
    if (lowerBetter) {
      return pct > 0 ? 'sc-delta-worse' : 'sc-delta-better';
    }
    return pct > 0 ? 'sc-delta-better' : 'sc-delta-worse';
  }

  dispose(): void {
    this.el.remove();
  }
}
