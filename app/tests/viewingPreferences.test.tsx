// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { useViewingPreferences } from "../src/app_x/hooks/useViewingPreferences";
import ViewingControls from "../src/app_x/components/ViewingControls";
import { arrangeScreens, VIEWING_LAYOUTS } from "../src/app_x/lib/viewingLayouts";

afterEach(() => { cleanup(); localStorage.clear(); });

it("defaults to Spotlight with selectors off and restores saved choices", () => {
  const first = renderHook(useViewingPreferences);
  expect(first.result.current[0]).toEqual({ layout: "spotlight", showStreamSelector: false });
  act(() => first.result.current[1]({ layout: "dual", showStreamSelector: true }));
  first.unmount();
  const second = renderHook(useViewingPreferences);
  expect(second.result.current[0]).toEqual({ layout: "dual", showStreamSelector: true });
});

it("recovers from invalid saved settings", () => {
  localStorage.setItem("multisport420:viewing", '{"layout":"removed","showStreamSelector":"false"}');
  expect(renderHook(useViewingPreferences).result.current[0]).toEqual({ layout: "spotlight", showStreamSelector: false });
});

it("offers twelve accessible layouts and changes the settings from their controls", () => {
  function Controls() {
    const [value, setValue] = useViewingPreferences();
    return <ViewingControls {...value} onLayoutChange={(layout) => setValue({ ...value, layout })}
      onShowStreamSelectorChange={(showStreamSelector) => setValue({ ...value, showStreamSelector })} />;
  }
  const view = render(<Controls />);
  expect(view.getAllByRole("option")).toHaveLength(12);
  fireEvent.change(view.getByRole("combobox", { name: "Layout" }), { target: { value: "dual" } });
  expect(view.getByText(/independent left \/ right placement/)).toBeTruthy();
  fireEvent.click(view.getByRole("checkbox", { name: "Show stream selector" }));
  expect(JSON.parse(localStorage.getItem("multisport420:viewing")!)).toEqual({ layout: "dual", showStreamSelector: true });
});

it.each(VIEWING_LAYOUTS)("fits 1–12 screens into distinct cells in $label", ({ id }) => {
  for (let count = 1; count <= 12; count++) {
    const { cells } = arrangeScreens(id, count);
    expect(cells).toHaveLength(count);
    const occupied = new Set<string>();
    for (const position of cells) {
      const [column, columns] = String(position.gridColumn).split(" / span ").map(Number);
      const [row, rows] = String(position.gridRow).split(" / span ").map(Number);
      for (let x = column; x < column + columns; x++) {
        for (let y = row; y < row + rows; y++) {
          const key = `${x},${y}`;
          expect(occupied.has(key)).toBe(false);
          occupied.add(key);
        }
      }
    }
  }
});
