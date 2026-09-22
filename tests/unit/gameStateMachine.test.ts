import { describe, expect, it } from 'vitest';
import { SeededRng } from '@/core/SeededRng';
import { DEFAULT_SPEC, type GameSpec } from '@/game/GameSpec';
import { GameStateMachine } from '@/game/GameStateMachine';
import type { Mode } from '@/game/Lottery';

const DT = 1 / 240;

function makeMachine(patch: Partial<GameSpec> = {}) {
  const spec: GameSpec = { ...structuredClone(DEFAULT_SPEC), ...patch };
  const m = new GameStateMachine(spec, new SeededRng(42));
  const log: string[] = [];
  const modes: [Mode, Mode][] = [];
  m.bus.on('mode', ({ from, to }) => modes.push([from, to]));
  m.bus.on('lid', ({ kind, open }) => log.push(`${kind}:${open ? 'open' : 'close'}`));
  m.bus.on('roundStart', ({ round }) => log.push(`round${round}`));
  return { m, spec, log, modes };
}

function run(m: GameStateMachine, seconds: number) {
  for (let i = 0; i < Math.round(seconds / DT); i++) m.update(DT);
}

/** 条件を満たすまで進める (上限つき) */
function runUntil(m: GameStateMachine, cond: () => boolean, maxSeconds = 600) {
  for (let i = 0; i < maxSeconds / DT; i++) {
    if (cond()) return;
    m.update(DT);
  }
  throw new Error('条件を満たしませんでした');
}

/** 大当りを引かせて、ラウンドを入賞で消化し、終了まで進める */
function playJackpot(m: GameStateMachine, attackerHits = 10) {
  m.forceJackpot();
  m.enterStart(false);
  runUntil(m, () => m.mode === 'jackpot');
  for (let r = 0; r < m.spec.rounds; r++) {
    runUntil(m, () => m.jackpot?.phase === 'round');
    for (let i = 0; i < attackerHits; i++) m.enterAttacker();
  }
  runUntil(m, () => m.mode !== 'jackpot');
}

describe('保留', () => {
  it('最大 4 個で、それ以上は取りこぼす', () => {
    const { m } = makeMachine();
    let overflow = 0;
    m.bus.on('holdOverflow', () => overflow++);
    // 変動が始まる前に 5 個入れる
    for (let i = 0; i < 5; i++) m.enterStart(false);
    expect(m.holds).toHaveLength(4);
    expect(overflow).toBe(1);
    m.update(DT);
    expect(m.spin).not.toBeNull();
    expect(m.holds).toHaveLength(3);
  });

  it('変動が終わると次の保留を消化する', () => {
    const { m } = makeMachine({ jackpotProb: 0 });
    m.enterStart(false);
    m.enterStart(false);
    let stops = 0;
    m.bus.on('spinStop', () => stops++);
    runUntil(m, () => stops === 2 && m.spin === null);
    expect(m.spinCount).toBe(2);
    expect(m.holds).toHaveLength(0);
  });
});

describe('大当り', () => {
  it('オープニング → 10 ラウンド (10 カウントで終了) → エンディング → ST / 時短', () => {
    const { m, log, modes } = makeMachine({ stRatio: 1 });
    playJackpot(m);
    expect(log.filter((l) => l.startsWith('round'))).toHaveLength(10);
    expect(log.filter((l) => l === 'attacker:open')).toHaveLength(10);
    expect(log.filter((l) => l === 'attacker:close')).toHaveLength(10);
    expect(m.mode).toBe('st');
    expect(m.supportLeft).toBe(100);
    expect(modes).toEqual([
      ['normal', 'jackpot'],
      ['jackpot', 'st'],
    ]);
  });

  it('入賞がなければ 1 ラウンドは 29.5 秒で終わる', () => {
    const { m } = makeMachine();
    m.forceJackpot();
    m.enterStart(false);
    runUntil(m, () => m.jackpot?.phase === 'round');
    const t0 = m.jackpot!.timer;
    expect(t0).toBeCloseTo(29.5, 1);
    run(m, 29.4);
    expect(m.jackpot!.phase).toBe('round');
    run(m, 0.2);
    expect(m.jackpot!.phase).toBe('interval');
  });

  it('ラウンド中でないときのアタッカー入賞は数えない', () => {
    const { m } = makeMachine();
    m.enterAttacker();
    expect(m.jackpot).toBeNull();
  });

  it('大当り中は保留を消化しない', () => {
    const { m } = makeMachine({ jackpotProb: 0 });
    m.forceJackpot();
    m.enterStart(false);
    runUntil(m, () => m.mode === 'jackpot');
    m.enterStart(false);
    const before = m.spinCount;
    run(m, 10);
    expect(m.spinCount).toBe(before);
    expect(m.holds).toHaveLength(1);
  });
});

describe('ST・時短', () => {
  it('ST は 100 回で通常に戻る', () => {
    const { m, modes } = makeMachine({ stRatio: 1, stJackpotProb: 0, jackpotProb: 0 });
    playJackpot(m);
    expect(m.mode).toBe('st');
    for (let i = 0; i < 100; i++) {
      m.enterStart(true);
      runUntil(m, () => m.spin !== null && m.spin.stopped);
      run(m, 1);
    }
    expect(m.mode).toBe('normal');
    expect(modes.at(-1)).toEqual(['st', 'normal']);
  });

  it('時短は 100 回で通常に戻り、時短中にも大当りを引ける', () => {
    const { m, modes } = makeMachine({ stRatio: 0, jackpotProb: 0 });
    playJackpot(m);
    expect(m.mode).toBe('jitan');
    for (let i = 0; i < 30; i++) {
      m.enterStart(true);
      runUntil(m, () => m.spin !== null && m.spin.stopped);
      run(m, 1);
    }
    expect(m.supportLeft).toBe(70);
    playJackpot(m);
    expect(modes).toContainEqual(['jitan', 'jackpot']);
  });

  it('ST 中に大当りを引くと再び大当りになる', () => {
    const { m, modes } = makeMachine({ stRatio: 1 });
    playJackpot(m);
    playJackpot(m);
    expect(modes).toContainEqual(['st', 'jackpot']);
  });
});

describe('普図と電チュー', () => {
  it('ゲート通過で普図が変動し、当たると電チューが開いて閉じる', () => {
    const spec = structuredClone(DEFAULT_SPEC);
    spec.fuzu.normal = { prob: 1, time: 2, open: 0.5 };
    const { m, log } = makeMachine({ fuzu: spec.fuzu });
    m.passGate();
    expect(m.fuzu.holds).toBe(1);
    run(m, 1.9);
    expect(m.lids.electric).toBe(false);
    run(m, 0.2);
    expect(m.lids.electric).toBe(true);
    run(m, 0.6);
    expect(m.lids.electric).toBe(false);
    expect(log).toEqual(['electric:open', 'electric:close']);
  });

  it('普図の保留は 4 個まで', () => {
    const { m } = makeMachine();
    for (let i = 0; i < 6; i++) m.passGate();
    expect(m.fuzu.holds).toBe(4);
  });

  it('電サポ中は普図が高確率・長開放になる', () => {
    const { m } = makeMachine({ stRatio: 0, jackpotProb: 0 });
    playJackpot(m);
    expect(m.support).toBe(true);
    let wins = 0;
    let total = 0;
    m.bus.on('fuzuStop', ({ win }) => {
      total++;
      if (win) wins++;
    });
    for (let i = 0; i < 60; i++) {
      m.passGate();
      run(m, 5);
    }
    expect(total).toBeGreaterThan(40);
    expect(wins / total).toBeGreaterThan(0.7);
  });
});
