/** Live performance counters: the status bar shows them and tests read them. */
export const perf = {
  frames: 0,
  /** Milliseconds of main-thread work spent drawing the canvas, accumulated. */
  renderMs: 0,
  appRenders: 0,
  canvasRenders: 0,
};

if (typeof window !== 'undefined') {
  (window as unknown as { __idv7perf: typeof perf }).__idv7perf = perf;
}
