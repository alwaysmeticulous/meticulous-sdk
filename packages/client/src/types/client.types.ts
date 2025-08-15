export interface RequestConfig<D = any> {
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
  get<T = any, R = Response<T>, D = any>(
    url: string,
    config?: RequestConfig<D>,
  ): Promise<R>;

  post<T = any, R = Response<T>, D = any>(
    url: string,
    data?: D,
    config?: RequestConfig<D>,
  ): Promise<R>;
}
