// one logical request stays active until its scope changes or it finishes.
export class RequestCoordinator {
  private active: { key: string; controller: AbortController; promise: Promise<unknown> } | null = null;

  run<T>(key: string, task: (signal: AbortSignal, isCurrent: () => boolean) => Promise<T>): Promise<T> {
    if (this.active?.key === key) return this.active.promise as Promise<T>;
    this.cancel();
    const entry = { key, controller: new AbortController(), promise: Promise.resolve() as Promise<unknown> };
    this.active = entry;
    entry.promise = Promise.resolve().then(() => task(entry.controller.signal, () => this.active === entry && !entry.controller.signal.aborted))
      .finally(() => { if (this.active === entry) this.active = null; });
    return entry.promise as Promise<T>;
  }

  cancel() {
    const active = this.active;
    this.active = null;
    active?.controller.abort();
  }
}

export interface RequestState { scope: string; loading: boolean; error: string | null }

export function resourceView<T>({ scope, result, request, ready, pauseReason, prerequisiteError }: {
  scope: string;
  result: { scope: string; data: T } | null;
  request: RequestState;
  ready: boolean;
  pauseReason: string | null;
  prerequisiteError: string | null;
}) {
  return {
    data: result?.scope === scope ? result.data : null,
    loading: ready && request.scope === scope && request.loading,
    error: ready ? request.scope === scope ? request.error : null : prerequisiteError,
    paused: !ready,
    pauseReason: ready ? null : pauseReason,
  };
}
