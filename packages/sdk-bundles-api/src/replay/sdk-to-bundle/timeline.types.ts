export interface ReplayTimelineEntry {
  kind: string;
  start: number;
  end: number;
  data: unknown;
}

export type ReplayTimelineData = ReplayTimelineEntry[];
