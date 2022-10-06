export interface ReplayTimelineEntry {
  kind: string;
  start: number;
  end: number;
  data: {
    [key: string]: any;
  };
}

export type ReplayTimelineData = ReplayTimelineEntry[];
