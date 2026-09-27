import type { ReactElement } from "react";

export type StreamCategory = string;
export type Category = string;

export type Stream = {
  category: StreamCategory;
  espn_id: number;
  raw_url: string;
  title: string;
  slug: string;
};

export type StreamSlug = Stream["slug"];

export type GetIframeParamsOptions = {
  maxAgeMs?: number;
};

export type Host<T> = {
  getLeagueCategories: () => readonly string[];
  getStreams: (options?: { maxAgeMs?: number }) => Promise<Stream[]>;
  getIframeParams: (stream: Stream, options?: GetIframeParamsOptions) => Promise<T>;
  getIframeDocStrElement: (params: T) => ReactElement;
};
