import RAPIER from '@dimforge/rapier2d-deterministic-compat';

export type Rapier = typeof RAPIER;

let ready: Promise<Rapier> | null = null;

/** Rapier の WASM を初期化する (何度呼んでも初期化は 1 回だけ) */
export function loadRapier(): Promise<Rapier> {
  ready ??= RAPIER.init().then(() => RAPIER);
  return ready;
}
