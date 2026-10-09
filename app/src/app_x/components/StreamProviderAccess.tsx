import { StreamProviderBlockedError } from "../lib/streamProviderAccess";

export default function StreamProviderAccess({ error }: { error: unknown }) {
  if (!(error instanceof StreamProviderBlockedError)) return null;

  return (
    <div>
      <p>Open the provider to review its warning or complete verification yourself. Then return here and refresh streams.</p>
      <a href={error.providerUrl} target="_blank" rel="noopener noreferrer">Open stream provider</a>
      <p>If the provider opens but this app still cannot load streams, access to the app may still be blocked.</p>
    </div>
  );
}
