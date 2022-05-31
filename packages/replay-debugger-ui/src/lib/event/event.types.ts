export interface ReplayableEvent {
  type: string;
  timeStamp: number;
  [key: string]: any;
}
