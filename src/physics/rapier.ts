import RAPIER from '@dimforge/rapier2d-deterministic-compat';

export type Rapier = typeof RAPIER;

export class PhysicsInitError extends Error {
  constructor(cause: unknown) {
    super(
      `物理エンジン (WebAssembly) を初期化できませんでした: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'PhysicsInitError';
  }
}

let ready: Promise<Rapier> | null = null;

/** Rapier の WASM を初期化する (何度呼んでも初期化は 1 回だけ。失敗したら次の呼び出しでやり直す) */
export function loadRapier(): Promise<Rapier> {
  ready ??= RAPIER.init().then(
    () => RAPIER,
    (e: unknown) => {
      ready = null;
      throw new PhysicsInitError(e);
    },
  );
  return ready;
}
