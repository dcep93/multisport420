import { VIEWING_LAYOUTS, type ViewingLayout } from "../lib/viewingLayouts";

export default function ViewingControls(props: {
  layout: ViewingLayout;
  showStreamSelector: boolean;
  onLayoutChange: (layout: ViewingLayout) => void;
  onShowStreamSelectorChange: (show: boolean) => void;
}) {
  const selected = VIEWING_LAYOUTS.find((layout) => layout.id === props.layout)!;
  return <section className="viewing-controls" aria-label="Viewing options">
    <label className="option-row">
      <span>Layout</span>
      <select className="option-input layout-select" value={props.layout}
        aria-describedby="layout-description"
        onChange={(event) => props.onLayoutChange(event.target.value as ViewingLayout)}>
        {VIEWING_LAYOUTS.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}
      </select>
    </label>
    <p className="viewing-description" id="layout-description">{selected.description}</p>
    <label className="option-row">
      <span>Show stream selector</span>
      <input type="checkbox" checked={props.showStreamSelector}
        onChange={(event) => props.onShowStreamSelectorChange(event.target.checked)} />
    </label>
    <p className="viewing-description">Show Stream 1 / Stream 2 choices above each player.</p>
  </section>;
}
