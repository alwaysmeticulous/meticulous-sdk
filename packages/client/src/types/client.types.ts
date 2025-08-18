export interface RequestConfig<D> {
  headers?: Record<string, string>;
  params?: Record<string, any>;
  timeout?: number;
  signal?: AbortSignal;
  data?: D;
}

export interface Response<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface MeticulousClient {
  get<T = any, R = Response<T>>(
    url: string,
    config?: RequestConfig<any>,
  ): Promise<R>;

  post<T = any, R = Response<any>>(url: string, data?: T): Promise<R>;

  put<T = any, R = Response<any>>(url: string, data?: T): Promise<R>;
}
