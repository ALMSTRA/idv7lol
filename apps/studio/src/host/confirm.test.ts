import { afterEach, describe, expect, it, vi } from 'vitest';

const pluginConfirm = vi.fn<(message: string, options?: unknown) => Promise<boolean>>();
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: pluginConfirm }));

/** Loads the helper afresh, so `isTauri` is worked out against the window given here. */
async function load(win: Record<string, unknown>) {
  vi.resetModules();
  vi.stubGlobal('window', win);
  return (await import('./confirm.js')).confirmDialog;
}

afterEach(() => {
  vi.unstubAllGlobals();
  pluginConfirm.mockReset();
});

describe('confirmDialog in a browser', () => {
  it("answers with the browser's own confirm", async () => {
    const confirm = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const confirmDialog = await load({ confirm });
    expect(await confirmDialog('Discard?')).toBe(true);
    expect(await confirmDialog('Discard?')).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Discard?');
    expect(pluginConfirm).not.toHaveBeenCalled();
  });

  it('takes anything that is not a plain yes as a no', async () => {
    // what a replaced, promise-returning confirm would hand back
    const confirmDialog = await load({ confirm: () => Promise.resolve(false) });
    expect(await confirmDialog('Discard?')).toBe(false);
  });
});

describe('confirmDialog in the desktop app', () => {
  it('waits for the dialog plugin and never calls window.confirm', async () => {
    const confirm = vi.fn(() => true);
    const confirmDialog = await load({ __TAURI_INTERNALS__: {}, confirm });
    let answer: (yes: boolean) => void = () => undefined;
    pluginConfirm.mockReturnValueOnce(new Promise<boolean>((resolve) => (answer = resolve)));

    let settled: boolean | undefined;
    const pending = confirmDialog('Discard?').then((v) => (settled = v));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBeUndefined();

    answer(false);
    await pending;
    expect(settled).toBe(false);
    expect(pluginConfirm).toHaveBeenCalledWith('Discard?', expect.anything());
    expect(confirm).not.toHaveBeenCalled();
  });
});
