import {
  ReplayTimelineData,
  ReplayTimelineEntry,
} from "@alwaysmeticulous/sdk-bundles-api";

export class ReplayTimelineCollector {
  private readonly entries: ReplayTimelineEntry[];
  constructor() {
    this.entries = [];
  }

  addEntry(entry: ReplayTimelineEntry): void {
    this.entries.push(entry);
  }

  getEntries(): ReplayTimelineData {
    return this.entries;
  }
}
