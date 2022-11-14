export interface ReplayableEvent {
  selector: string;
  altSelectors?: {
    classesOnly: string;
    traversal: string;
    [key: string]: string;
  };

  type: string;

  clientX?: number;
  clientY?: number;
  x?: number;
  y?: number;

  timeStamp: number;
  timeStampRaw: number;
  retries?: number;
}
