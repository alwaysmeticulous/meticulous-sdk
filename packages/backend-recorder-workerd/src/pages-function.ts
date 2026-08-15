import {
  runWithMeticulous,
  type WithMeticulousOptions,
} from "./with-meticulous";

/**
 * Structural subset of a Cloudflare Pages Functions `EventContext` — the argument an `onRequest`
 * handler receives. Only the four fields the recorder reads are declared; everything else on the
 * real context (`params`, `data`, `next`, `functionPath`, `passThroughOnException`) is preserved
 * by the wrapper without being named here, so this stays free of a
 * `@cloudflare/workers-types` dependency.
 */
export interface MeticulousPagesFunctionContext<Env = unknown> {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

export type MeticulousPagesFunction<
  Context extends MeticulousPagesFunctionContext =
    MeticulousPagesFunctionContext,
> = (context: Context) => Response | Promise<Response>;

/**
 * The Pages Functions equivalent of {@link withMeticulous}:
 *
 *   export const onRequest = withMeticulousPagesFunction(handler);
 *
 * A Pages project's worker exports `onRequest(context)` rather than `{ fetch(request, env, ctx) }`,
 * so the module-Worker wrapper cannot be applied to it. Recording, replay, configuration and
 * failure behaviour are otherwise identical — see {@link withMeticulous} for all of it.
 *
 * Apply it **outermost**, before any wrapper of your own that re-writes `context.env`: the
 * recorder discovers bindings on the `env` it is handed, so a wrapper that substitutes its own
 * façades first would hide the real binding instances from it.
 */
export const withMeticulousPagesFunction =
  <Context extends MeticulousPagesFunctionContext>(
    handler: MeticulousPagesFunction<Context>,
    options?: WithMeticulousOptions,
  ) =>
  (context: Context): Promise<Response> =>
    runWithMeticulous(
      {
        request: context.request,
        env: context.env,
        ctx: { waitUntil: (promise) => context.waitUntil(promise) },
        invokeHandler: () => handler(context),
      },
      options,
    );
