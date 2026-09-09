import { useEffect, useMemo, useReducer, useState } from "react";
import type { Stream, StreamSlug } from "../config/types";

function parseSelectedSlugsFromHash(
  hash: string,
): StreamSlug[] {
  return hash
    .replace(/^#/, "")
    .split(",")
    .map((slug) => slug.trim())
    .filter((slug, index, array): slug is StreamSlug =>
      isAllowedUniqueSlug(slug, index, array),
    );
}

function isAllowedUniqueSlug(
  slug: string,
  index: number,
  array: string[],
): slug is StreamSlug {
  if (!slug || array.indexOf(slug) !== index) {
    return false;
  }
  return true;
}

function writeSelectedSlugsToHash(slugs: StreamSlug[]) {
  const hash = serializeSelectedSlugs(slugs);
  const url = new URL(window.location.href);

  if (hash) {
    url.hash = hash;
  } else {
    url.hash = "";
  }

  window.history.replaceState(null, "", url);
}

function serializeSelectedSlugs(slugs: StreamSlug[]) {
  return slugs.join(",");
}

function hashMatchesSelectedSlugs(slugs: StreamSlug[]) {
  return window.location.hash.replace(/^#/, "") === serializeSelectedSlugs(slugs);
}

type SelectionState = {
  selectedSlugs: StreamSlug[];
  selectedStreamsBySlug: Partial<Record<StreamSlug, Stream>>;
};

type SelectionAction =
  | { type: "restoreSelection"; streams: Stream[] }
  | {
      type: "setSelectedSlugs";
      selectedSlugs: StreamSlug[];
      streams: Stream[] | null;
    }
  | {
      type: "hydrateMissingSelectedStreams";
      streams: Stream[] | null;
    }
  | {
      type: "replaceSelectedStream";
      stream: Stream;
    };

function buildStreamsBySlug(streams: Stream[] | null) {
  return new Map((streams ?? []).map((stream) => [stream.slug, stream] as const));
}

function syncSelectedSlugsWithStreams(
  selectedSlugs: StreamSlug[],
  streamsBySlug: Map<StreamSlug, Stream>,
) {
  return selectedSlugs.filter((selectedSlug) => streamsBySlug.has(selectedSlug));
}

function applySelectedSlugs(
  state: SelectionState,
  selectedSlugs: StreamSlug[],
  streams: Stream[] | null,
): SelectionState {
  const streamsBySlug = buildStreamsBySlug(streams);
  const nextSelectedSlugs =
    streams === null ? selectedSlugs : syncSelectedSlugsWithStreams(selectedSlugs, streamsBySlug);
  const selectedStreamsBySlug: Partial<Record<StreamSlug, Stream>> = {};

  for (const selectedSlug of nextSelectedSlugs) {
    const lockedStream = state.selectedStreamsBySlug[selectedSlug];
    const currentStream = streamsBySlug.get(selectedSlug);

    if (lockedStream) {
      selectedStreamsBySlug[selectedSlug] = lockedStream;
      continue;
    }

    if (currentStream) {
      selectedStreamsBySlug[selectedSlug] = currentStream;
    }
  }

  return {
    selectedSlugs: nextSelectedSlugs,
    selectedStreamsBySlug,
  };
}

function selectedStreamsReducer(state: SelectionState, action: SelectionAction): SelectionState {
  if (action.type === "restoreSelection") {
    return { selectedSlugs: action.streams.map((stream) => stream.slug),
      selectedStreamsBySlug: Object.fromEntries(action.streams.map((stream) => [stream.slug, stream])) };
  }
  if (action.type === "setSelectedSlugs") {
    return applySelectedSlugs(state, action.selectedSlugs, action.streams);
  }

  if (action.type === "hydrateMissingSelectedStreams") {
    if (action.streams === null) {
      return state;
    }

    const streamsBySlug = buildStreamsBySlug(action.streams);
    const nextSelectedSlugs = syncSelectedSlugsWithStreams(state.selectedSlugs, streamsBySlug);

    if (nextSelectedSlugs.length !== state.selectedSlugs.length) {
      return applySelectedSlugs(state, nextSelectedSlugs, action.streams);
    }

    let nextSelectedStreamsBySlug = state.selectedStreamsBySlug;
    let didChange = false;

    for (const selectedSlug of state.selectedSlugs) {
      if (nextSelectedStreamsBySlug[selectedSlug]) {
        continue;
      }

      const currentStream = streamsBySlug.get(selectedSlug);
      if (!currentStream) {
        continue;
      }

      if (!didChange) {
        nextSelectedStreamsBySlug = { ...state.selectedStreamsBySlug };
        didChange = true;
      }

      nextSelectedStreamsBySlug[selectedSlug] = currentStream;
    }

    if (!didChange) {
      return state;
    }

    return {
      ...state,
      selectedStreamsBySlug: nextSelectedStreamsBySlug,
    };
  }

  if (!state.selectedSlugs.includes(action.stream.slug)) {
    return state;
  }

  return {
    ...state,
    selectedStreamsBySlug: {
      ...state.selectedStreamsBySlug,
      [action.stream.slug]: action.stream,
    },
  };
}

export default function useSelectedStreamIds(streams: Stream[] | null, roomStreams?: Stream[]) {
  const [initialHash] = useState(() => window.location.hash);
  const initialSelectedSlugs = useMemo(() => parseSelectedSlugsFromHash(initialHash), [initialHash]);
  const [state, dispatch] = useReducer(
    selectedStreamsReducer,
    initialSelectedSlugs,
    (selectedSlugs): SelectionState =>
      applySelectedSlugs(
        {
          selectedSlugs: [],
          selectedStreamsBySlug: {},
        },
        selectedSlugs,
        streams,
      ),
  );

  function setSelectedSlugs(selectedSlugs: StreamSlug[]) {
    dispatch({
      type: "setSelectedSlugs",
      selectedSlugs,
      streams,
    });
  }

  function replaceSelectedStream(stream: Stream) {
    dispatch({
      type: "replaceSelectedStream",
      stream,
    });
  }

  useEffect(() => {
    const onHashChange = () => {
      if (roomStreams) return;
      dispatch({
        type: "setSelectedSlugs",
        selectedSlugs: parseSelectedSlugsFromHash(window.location.hash),
        streams,
      });
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [streams, roomStreams]);

  useEffect(() => {
    dispatch({
      type: "hydrateMissingSelectedStreams",
      streams,
    });
  }, [streams]);

  useEffect(() => {
    const slugs = roomStreams ? roomStreams.map((stream) => stream.slug) : state.selectedSlugs;
    if (!hashMatchesSelectedSlugs(slugs)) {
      writeSelectedSlugsToHash(slugs);
    }
  }, [state.selectedSlugs, roomStreams]);

  const selectedStreams = useMemo(
    () =>
      state.selectedSlugs
        .map((slug) => state.selectedStreamsBySlug[slug])
        .filter((stream): stream is Stream => stream !== undefined),
    [state.selectedSlugs, state.selectedStreamsBySlug],
  );

  return {
    restoreSelection: (streams: Stream[]) => dispatch({ type: "restoreSelection", streams }),
    hadHashSelectionOnLoad: initialSelectedSlugs.length > 0,
    selectedSlugs: state.selectedSlugs,
    selectedStreams,
    setSelectedSlugs,
    replaceSelectedStream,
  };
}
