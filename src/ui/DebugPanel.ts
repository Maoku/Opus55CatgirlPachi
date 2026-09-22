import { DEFAULT_PHYSICS, type MaterialName, type PhysicsParams } from '@/board/types';
import { SetBoardField } from '@/editor/commands';
import type { Editor } from '@/editor/Editor';
import { h } from './dom';

export interface PerfStats {
  fps: number;
  /** 1 フレームあたりの物理・ゲームの処理時間 (ms) */
  stepMs: number;
  /** 1 フレームあたりの描画準備と描画の時間 (ms) */
  drawMs: number;
  steps: number;
  balls: number;
  particles: number;
}

const MATERIAL_LABELS: Record<MaterialName, string> = {
  ball: '玉同士',
  nail: '釘',
  rail: 'レール',
  plastic: 'プラ',
  rubber: 'ゴム',
  windmill: '風車',
};

type NumKey = Exclude<keyof PhysicsParams, 'materials'>;

const FIELDS: { key: NumKey; label: string; step: number; min: number; unit?: string }[] = [
  { key: 'gravity', label: '重力', step: 10, min: 0, unit: 'cm/s²' },
  { key: 'tilt', label: '傾き係数', step: 0.05, min: 0 },
  { key: 'linearDamping', label: '線形減衰', step: 0.05, min: 0 },
  { key: 'ballRadius', label: '玉の半径', step: 0.01, min: 0.1, unit: 'cm' },
  { key: 'ballMass', label: '玉の質量', step: 0.1, min: 0.1, unit: 'g' },
  { key: 'maxBalls', label: '玉の上限', step: 10, min: 1, unit: '個' },
  { key: 'stallSpeed', label: '滞留の速さ', step: 0.5, min: 0, unit: 'cm/s' },
  { key: 'stallTime', label: '滞留の時間', step: 0.5, min: 0.1, unit: '秒' },
];

/** 物理パラメータの調整と処理時間の表示 (デバッグ用) */
export class DebugPanel {
  readonly el: HTMLElement;
  private readonly perf = h('pre', { className: 'perf' });
  private readonly body = h('div', { className: 'debug-body' });

  constructor(private readonly editor: Editor) {
    const reset = h('button', { textContent: '既定値に戻す' });
    reset.addEventListener('click', () => this.set(structuredClone(DEFAULT_PHYSICS)));
    this.el = h('details', { className: 'panel debug' }, [
      h('summary', { textContent: '物理パラメータ・処理時間 (デバッグ)' }),
      this.perf,
      this.body,
      h('div', { className: 'row' }, [reset]),
      h('p', {
        className: 'help',
        textContent:
          '変更は盤面データに保存され、エディタの「元に戻す」で取り消せます。物理ワールドは少し待ってから作り直されます。',
      }),
    ]);
    editor.bus.on('change', () => this.render());
    this.render();
  }

  private get params(): PhysicsParams {
    return this.editor.board.physics;
  }

  private set(after: PhysicsParams): void {
    this.editor.execute(new SetBoardField('physics', this.params, after, '物理パラメータの変更'));
  }

  private numInput(value: number, step: number, min: number, onChange: (v: number) => void) {
    const input = h('input', {
      type: 'number',
      className: 'num',
      step: String(step),
      min: String(min),
      value: String(Math.round(value * 1e4) / 1e4),
    });
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (Number.isFinite(v) && v >= min) onChange(v);
      else input.value = String(value);
    });
    return input;
  }

  private render(): void {
    // 入力中の欄は作り直さない
    if (this.body.contains(document.activeElement)) return;
    const p = this.params;
    const rows: HTMLElement[] = FIELDS.map((f) =>
      h('label', { className: 'prop' }, [
        h('span', { textContent: f.label }),
        this.numInput(p[f.key], f.step, f.min, (v) =>
          this.set({ ...this.params, [f.key]: f.key === 'maxBalls' ? Math.round(v) : v }),
        ),
        f.unit ? h('span', { className: 'unit', textContent: f.unit }) : null,
      ]),
    );
    const hz = h(
      'select',
      {},
      [240, 360, 480].map((v) => h('option', { value: String(v), textContent: `1/${v} 秒` })),
    );
    hz.value = String(Math.round(1 / p.timestep));
    hz.addEventListener('change', () =>
      this.set({ ...this.params, timestep: 1 / Number(hz.value) }),
    );
    rows.push(h('label', { className: 'prop' }, [h('span', { textContent: 'ステップ' }), hz]));

    const mats = Object.keys(p.materials) as MaterialName[];
    const table = h('table', { className: 'report-table materials' }, [
      h('tr', {}, [
        h('th', { textContent: '材質 (玉との組み合わせ)' }),
        h('th', { textContent: '反発' }),
        h('th', { textContent: '摩擦' }),
      ]),
      ...mats.map((m) =>
        h('tr', {}, [
          h('td', { textContent: MATERIAL_LABELS[m] }),
          h('td', {}, [
            this.numInput(p.materials[m].restitution, 0.05, 0, (v) =>
              this.setMaterial(m, { restitution: v }),
            ),
          ]),
          h('td', {}, [
            this.numInput(p.materials[m].friction, 0.01, 0, (v) =>
              this.setMaterial(m, { friction: v }),
            ),
          ]),
        ]),
      ),
    ]);
    this.body.replaceChildren(h('div', { className: 'prop-grid' }, rows), table);
  }

  private setMaterial(
    name: MaterialName,
    patch: Partial<PhysicsParams['materials'][MaterialName]>,
  ) {
    const p = structuredClone(this.params);
    p.materials[name] = { ...p.materials[name], ...patch };
    this.set(p);
  }

  updatePerf(s: PerfStats): void {
    if (!(this.el as HTMLDetailsElement).open) return;
    this.perf.textContent =
      `FPS ${s.fps.toFixed(0)}  物理 ${s.stepMs.toFixed(2)}ms/フレーム (${s.steps} ステップ)\n` +
      `描画 ${s.drawMs.toFixed(2)}ms  玉 ${s.balls}  粒子 ${s.particles}`;
  }
}
