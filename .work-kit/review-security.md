### Review: Security

**Findings:**
- None. All changes are client-side only (no server, no auth, no network requests). The screenshot feature captures the Pixi.js canvas via `renderer.extract.canvas()`, converts to a Blob, and triggers a download with a hardcoded filename prefix (`agentmove-`) plus a timestamp derived from `Date`. No user input flows into the filename, URL, or DOM. The blob URL is created and revoked immediately. No new dependencies added.

**Fixes Applied:**
- None

**Remaining Risks:**
- None

**Severity Summary:** no issues
