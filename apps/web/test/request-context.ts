import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The request scope Next.js normally provides.
 *
 * `headers()` only works inside one, and the guard reads the Authorization
 * header through it, so a route test has to open a scope of its own before
 * calling a handler. Kept in its own module because `test/setup.ts` mocks
 * `next/headers` against it, and a `vi.mock` factory may not close over
 * anything declared in the setup file itself.
 */
export interface TestRequestScope {
  headers: Headers;
  /** What the Auth.js cookie session claims. `null` = no cookie at all. */
  session: unknown;
}

const store = new AsyncLocalStorage<TestRequestScope>();

export function runInRequestScope<T>(scope: TestRequestScope, fn: () => T): T {
  return store.run(scope, fn);
}

export function currentScope(): TestRequestScope {
  const scope = store.getStore();
  if (!scope) {
    throw new Error(
      "İstek kapsamı yok: yol işleyicisini callRoute() ile çağırın " +
        "(headers() yalnız bir istek içinde çalışır).",
    );
  }
  return scope;
}
