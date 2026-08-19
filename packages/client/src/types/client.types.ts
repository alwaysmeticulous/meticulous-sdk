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

/**
 * The response type parameter is the body type, not the envelope: every method
 * resolves to `Response<T>`. Callers cannot substitute their own return type,
 * which is what previously allowed a call site to assert the unwrapped body and
 * silently receive the envelope at runtime.
 */
export interface MeticulousClient {
  get<T = any>(url: string, config?: RequestConfig<any>): Promise<Response<T>>;

  post<T = any, D = any>(
    url: string,
    data?: D,
    config?: RequestConfig<any>,
  ): Promise<Response<T>>;

  put<T = any, D = any>(
    url: string,
    data?: D,
    config?: RequestConfig<any>,
  ): Promise<Response<T>>;

  delete<T = any>(
    url: string,
    config?: RequestConfig<any>,
  ): Promise<Response<T>>;
}
