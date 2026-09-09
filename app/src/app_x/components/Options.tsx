import type { ReactNode } from "react";
import type { Category, StreamCategory } from "../config/types";
import {
  clearProxyCache,
  getApproximateProxyCacheSizeBytes,
} from "../lib/proxy420";

function getCategoryOptions(categories: readonly StreamCategory[]): Category[] {
  return ["ALL", ...categories];
}

async function clearAppCache() {
  const approximateSizeBytes = await getApproximateProxyCacheSizeBytes().catch(
    () => 0,
  );
  const approximateSizeLabel = formatApproximateSize(approximateSizeBytes);

  if (
    !window.confirm(
      `Are you sure? This will clear about ${approximateSizeLabel} from IndexedDB.`,
    )
  ) {
    return false;
  }

  await clearProxyCache().catch(() => undefined);
  localStorage.clear();
  return true;
}

function formatApproximateSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Options(props: {
  roomControls?: ReactNode;
  category: Category;
  categories: readonly StreamCategory[];
  onCategoryChange: (value: Category) => void;
  displayLogs: boolean;
  logDelayMs: number;
  onDisplayLogsChange: (value: boolean) => void;
  onLogDelayMsChange: (value: number) => void;
  onClearCache: () => void;
}) {
  return (
    <section className="menu-card">
      <div className="menu-card-header">
        <h2>Options</h2>
        <button
          className="secondary-button secondary-button-inline"
          type="button"
          onClick={async () => {
            const didClearCache = await clearAppCache();
            if (!didClearCache) return;
            props.onClearCache();
          }}
        >
          clear cache
        </button>
      </div>
      <div className="option-row">
        <select
          aria-label="categories"
          className="option-input option-input-inline"
          value={props.category}
          onChange={(event) =>
            props.onCategoryChange(event.target.value as Category)
          }
        >
          {getCategoryOptions(props.categories).map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <div className="option-row option-row-grouped">
        <div className="option-row-controls">
          <input
            className="option-input"
            aria-label="log delay ms"
            value={formatNumberWithSeparators(props.logDelayMs)}
            inputMode="numeric"
            onChange={(event) => {
              const nextValue = event.target.value;
              const digitsOnly = nextValue.replace(/[^\d]/g, "");
              props.onLogDelayMsChange(Number(digitsOnly || "0"));
            }}
          />
        </div>
        <div className="option-row-label">
          <span>log delay ms</span>
          <input
            checked={props.displayLogs}
            type="checkbox"
            aria-label="display logs"
            title="Display logs"
            onChange={(event) => props.onDisplayLogsChange(event.target.checked)}
          />
        </div>
      </div>
      {props.roomControls}
    </section>
  );
}

function formatNumberWithSeparators(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
