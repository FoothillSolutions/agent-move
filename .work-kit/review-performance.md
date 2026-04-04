### Review: Performance

**Findings:**
- `URL.revokeObjectURL(url)` was called synchronously immediately after `a.click()`. Since `a.click()` triggers an async download, revoking the blob URL immediately can cause the download to fail in some browsers that haven't finished reading the blob yet.

**Fixes Applied:**
- Wrapped `URL.revokeObjectURL(url)` in a 1-second `setTimeout` to give the browser time to initiate the download before releasing the blob memory.

**Recommendations:**
- None. The feature is user-triggered (button click or keyboard shortcut), so there are no hot-path, scaling, or re-render concerns. Canvas extraction and blob creation are one-shot operations with proper cleanup.
