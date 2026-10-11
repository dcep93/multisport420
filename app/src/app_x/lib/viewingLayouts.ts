import type { CSSProperties } from "react";

export const VIEWING_LAYOUTS = [
  { id: "spotlight", label: "Spotlight", description: "One main game with optional logs and a row of streams below." },
  { id: "dual", label: "Dual spotlight · no log", description: "Two main games with independent left / right placement and sound controls. No logs." },
  { id: "cinema", label: "Cinema", description: "An extra-large main game with a slim preview strip. No logs." },
  { id: "grid", label: "Grid wall", description: "Equal-sized screens across the wall. Select any game for audio. No logs." },
  { id: "filmstrip", label: "Filmstrip", description: "A main game on the left and a vertical rail of previews on the right. No logs." },
  { id: "mosaic", label: "Mosaic", description: "A large feature game surrounded by smaller tiles. No logs." },
  { id: "triple", label: "Triple feature", description: "Three main games across the top, with previews below. No logs." },
  { id: "quad", label: "Quad feature", description: "Four main games in a two-by-two block, with extra games below. No logs." },
  { id: "left-rail", label: "Left rail", description: "A large main game on the right, with a vertical preview rail on the left. No logs." },
  { id: "top-rail", label: "Top rail", description: "Previews across the top and an expansive main game below. No logs." },
  { id: "columns", label: "Columns", description: "Every game side by side in a full-height column. No logs." },
  { id: "stack", label: "Stack", description: "Full-width games stacked from top to bottom. No logs." },
] as const;

export type ViewingLayout = typeof VIEWING_LAYOUTS[number]["id"];
export function isViewingLayout(value: unknown): value is ViewingLayout {
  return VIEWING_LAYOUTS.some((layout) => layout.id === value);
}

// Placement changes only CSS, keeping the keyed players alive during switches.
export function arrangeScreens(layout: ViewingLayout, count: number): {
  grid: CSSProperties; cells: CSSProperties[];
} {
  const cell = (column: number, row: number, columns = 1, rows = 1): CSSProperties => ({
    gridColumn: `${column} / span ${columns}`, gridRow: `${row} / span ${rows}`,
  });
  if (count <= 1) return { grid: { gridTemplateColumns: "1fr", gridTemplateRows: "1fr" }, cells: [cell(1, 1)] };
  if (layout === "columns" || layout === "stack") return {
    grid: { gridTemplateColumns: `repeat(${layout === "columns" ? count : 1}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout === "stack" ? count : 1}, minmax(0, 1fr))` },
    cells: Array.from({ length: count }, (_, i) => cell(layout === "columns" ? i + 1 : 1, layout === "stack" ? i + 1 : 1)),
  };
  if (layout === "top-rail") return {
    grid: { gridTemplateColumns: `repeat(${count - 1}, minmax(0, 1fr))`, gridTemplateRows: "minmax(70px, 18%) minmax(0, 1fr)" },
    cells: [cell(1, 2, count - 1), ...Array.from({ length: count - 1 }, (_, i) => cell(i + 1, 1))],
  };
  if (layout === "triple" || layout === "quad") {
    const mainCount = Math.min(count, layout === "triple" ? 3 : 4);
    const mainColumns = layout === "quad" ? Math.min(2, mainCount) : mainCount;
    const mainRows = Math.ceil(mainCount / mainColumns);
    const previews = count - mainCount;
    const columns = mainColumns * Math.max(1, previews);
    return {
      grid: { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${mainRows}, minmax(0, 1fr))${previews ? " minmax(70px, 18%)" : ""}` },
      cells: [...Array.from({ length: mainCount }, (_, i) => cell((i % mainColumns) * columns / mainColumns + 1, Math.floor(i / mainColumns) + 1, columns / mainColumns)),
        ...Array.from({ length: previews }, (_, i) => cell(i * mainColumns + 1, mainRows + 1, mainColumns))],
    };
  }
  if (layout === "spotlight" || layout === "cinema") {
    return {
      grid: { gridTemplateColumns: `repeat(${count - 1}, minmax(0, 1fr))`, gridTemplateRows: layout === "cinema" ? "minmax(0, 1fr) minmax(70px, 15%)" : "minmax(0, 1fr) clamp(140px, 24vh, 220px)" },
      cells: [cell(1, 1, count - 1), ...Array.from({ length: count - 1 }, (_, i) => cell(i + 1, 2))],
    };
  }
  if (layout === "dual") {
    const previews = count - 2;
    const columns = Math.max(2, previews * 2);
    return {
      grid: { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: previews ? "minmax(0, 1fr) minmax(70px, 20%)" : "minmax(0, 1fr)" },
      cells: [cell(1, 1, columns / 2), cell(columns / 2 + 1, 1, columns / 2), ...Array.from({ length: previews }, (_, i) => cell(i * 2 + 1, 2, 2))],
    };
  }
  if (layout === "filmstrip" || layout === "left-rail") return {
    grid: { gridTemplateColumns: layout === "left-rail" ? "minmax(0, 1fr) minmax(0, 3fr)" : "minmax(0, 3fr) minmax(0, 1fr)", gridTemplateRows: `repeat(${count - 1}, minmax(0, 1fr))` },
    cells: [cell(layout === "left-rail" ? 2 : 1, 1, 1, count - 1), ...Array.from({ length: count - 1 }, (_, i) => cell(layout === "left-rail" ? 1 : 2, i + 1))],
  };
  if (layout === "mosaic" && count > 2) {
    const columns = Math.max(3, Math.ceil(Math.sqrt(count + 3)));
    const rows = Math.max(2, Math.ceil((count + 3) / columns));
    const cells = [cell(1, 1, 2, 2)];
    for (let row = 1; row <= rows; row++) {
      for (let column = 1; column <= columns; column++) {
        if (row <= 2 && column <= 2) continue;
        if (cells.length < count) {
          const isLast = cells.length === count - 1;
          cells.push(cell(column, row, isLast ? columns - column + 1 : 1, isLast && row === 1 ? rows : 1));
        }
      }
    }
    return { grid: { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }, cells };
  }
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return {
    grid: { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` },
    cells: Array.from({ length: count }, (_, i) => cell(i % columns + 1, Math.floor(i / columns) + 1)),
  };
}
