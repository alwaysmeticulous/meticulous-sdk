export interface RecordedSession {
  id: string;
  datetime: string;
  numberUserEvents: number;
  numberBytes: number;
  startUrl: string;
  abandoned: boolean;
  recordingToken: string;
}
