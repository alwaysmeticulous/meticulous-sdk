import {
  SDKReplayTimelineData,
  SDKReplayTimelineEntry,
} from "@alwaysmeticulous/api";

export class ReplayTimelineCollector {
  private readonly entries: SDKReplayTimelineEntry[];
  constructor() {
    this.entries = [];
  }

  addEntry(entry: SDKReplayTimelineEntry): void {
    this.entries.push(entry);
  }

  getEntries(): SDKReplayTimelineData {
    return this.entries;
  }
}
