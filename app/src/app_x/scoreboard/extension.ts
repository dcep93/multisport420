type Runtime = {
  lastError?: { message?: string };
  sendMessage: (id: string, payload: unknown, callback: (response: unknown) => void) => void;
};

function waitForExtensionId(): Promise<string> {
  const getId = () => document.documentElement.dataset.multisport420ExtensionId;
  const existing = getId();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const id = getId();
      if (id || Date.now() - started >= 3000) {
        window.clearInterval(timer);
        if (id) resolve(id);
        else reject(new Error("Multisport420 extension unavailable"));
      }
    }, 50);
  });
}

export async function extensionHelper(payload: unknown): Promise<unknown> {
  const runtime = (window as Window & { chrome?: { runtime?: Runtime } }).chrome?.runtime;
  if (!runtime?.sendMessage) throw new Error("Chrome extension runtime unavailable");
  const id = await waitForExtensionId();
  return new Promise((resolve, reject) => {
    runtime.sendMessage(id, payload, response => {
      const error = runtime.lastError;
      if (error || response === undefined) {
        reject(new Error(error?.message || "Empty extension response"));
      } else resolve(response);
    });
  });
}
