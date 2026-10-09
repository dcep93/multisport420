export class StreamProviderBlockedError extends Error {
  readonly providerUrl: string;

  constructor(message: string, providerUrl: string) {
    super(message);
    this.name = "StreamProviderBlockedError";
    const url = new URL(providerUrl);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
      throw new Error("Invalid stream provider URL.");
    }
    this.providerUrl = url.href;
  }
}

export function checkStreamProviderAccess(html: string, providerUrl: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const cloudflareError = document.querySelector("#cf-wrapper") && /cloudflare/i.test(document.title);
  const challenge = /just a moment|attention required/i.test(document.title) &&
    document.querySelector('#challenge-form, script[src*="/cdn-cgi/challenge-platform/"], .cf-turnstile');
  if (!cloudflareError && !challenge) return;

  const warning = /suspected malware|suspected phishing/i.exec(document.title)?.[0].toLowerCase();
  throw new StreamProviderBlockedError(
    warning
      ? `Cloudflare has flagged the stream provider for ${warning}.`
      : "Cloudflare is blocking access to the stream provider.",
    providerUrl,
  );
}
