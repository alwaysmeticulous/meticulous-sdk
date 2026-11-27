export {
  loadAndStartRecorder,
  tryLoadAndStartRecorder,
  type Recorder,
} from "./loader";
export type { LoaderOptions } from "./loader.types";
export {
  tryInstallMeticulousIntercepts,
  type Interceptor,
  type InterceptorOptions,
} from "./install-meticulous-intercepts";
export { stopIntercepting } from "./early-network-recorder";
