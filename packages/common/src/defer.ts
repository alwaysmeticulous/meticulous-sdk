export type DeferredStatus = "pending" | "fulfilled" | "rejected";

export interface Deferred<T = void> {
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
  promise: Promise<T>;
  getState: () => DeferredStatus;
}

export function defer<T = void>(): Deferred<T> {
  let state: DeferredStatus = "pending";
  let resolve: ((value: T | PromiseLike<T>) => void) | null = null;
  let reject: ((reason?: any) => void) | null = null;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.then(
    () => {
      state = "fulfilled";
    },
    () => {
      state = "rejected";
    }
  );
  return {
    resolve: resolve as any,
    reject: reject as any,
    promise,
    getState: () => state,
  };
}
