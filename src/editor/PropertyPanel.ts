import {
  POCKET_KINDS,
  WALL_MATERIALS,
  type BoardObject,
  type LauncherDef,
  type PocketKind,
  type RotRect,
  type WallMaterial,
} from '@/board/types';
import { h } from '@/ui/dom';
import { ReplaceObjects, SetBoardField } from './commands';
import { defaultLid } from './defaults';
import type { Editor } from './Editor';
import { objectLabel, POCKET_LABELS } from './objectOps';
import { MATERIAL_LABELS } from './tools/WallTool';

interface NumOpts {
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  digits?: number;
}

/** 選択中のオブジェクト (なければ盤面設定) を数値で編集するパネル */
export class PropertyPanel {
  readonly el: HTMLElement;
  private readonly body = h('div', { className: 'props' });
  private readonly title = h('h2', { textContent: 'プロパティ' });
  private syncers: (() => void)[] = [];
  private renderedKey = '';

  constructor(private readonly editor: Editor) {
    this.el = h('section', { className: 'panel' }, [this.title, this.body]);
    editor.bus.on('selection', () => this.render());
    editor.bus.on('change', () => {
      // 選択中のオブジェクトの種類が変わったら作り直し、そうでなければ値だけ更新する
      if (this.key() !== this.renderedKey) this.render();
      else this.sync();
    });
    this.render();
  }

  private key(): string {
    return this.editor
      .selectedObjects()
      .map((o) => `${o.id}:${o.type}:${o.type === 'pocket' ? `${o.kind}:${!!o.lid}` : ''}`)
      .join(',');
  }

  private sync(): void {
    for (const s of this.syncers) s();
  }

  render(): void {
    this.syncers = [];
    this.renderedKey = this.key();
    const sel = this.editor.selectedObjects();
    let rows: HTMLElement[];
    if (sel.length === 0) {
      this.title.textContent = '盤面設定';
      rows = this.boardRows();
    } else if (sel.length === 1) {
      this.title.textContent = `プロパティ: ${objectLabel(sel[0]!)} (${sel[0]!.id})`;
      rows = this.objectRows(sel[0]!.id);
    } else {
      this.title.textContent = `プロパティ: ${sel.length} 個`;
      rows = this.multiRows(sel);
    }
    this.body.replaceChildren(...rows);
  }

  // ---- 入力部品 ----

  private num(label: string, get: () => number, set: (v: number) => void, o: NumOpts = {}) {
    const input = h('input', {
      type: 'number',
      step: String(o.step ?? 1),
      className: 'num',
    });
    if (o.min !== undefined) input.min = String(o.min);
    if (o.max !== undefined) input.max = String(o.max);
    const digits = o.digits ?? 2;
    const show = () => {
      if (document.activeElement === input) return;
      input.value = String(Math.round(get() * 10 ** digits) / 10 ** digits);
    };
    show();
    this.syncers.push(show);
    input.addEventListener('change', () => {
      let v = Number(input.value);
      if (!Number.isFinite(v)) return show();
      if (o.min !== undefined) v = Math.max(o.min, v);
      if (o.max !== undefined) v = Math.min(o.max, v);
      if (Math.abs(v - get()) > 1e-9) set(v);
      input.blur();
      show();
    });
    return h('label', { className: 'prop' }, [
      h('span', { textContent: label }),
      input,
      o.unit ? h('span', { className: 'unit', textContent: o.unit }) : null,
    ]);
  }

  private select<T extends string>(
    label: string,
    options: readonly T[],
    names: Record<T, string>,
    get: () => T,
    set: (v: T) => void,
  ) {
    const s = h(
      'select',
      {},
      options.map((v) => h('option', { value: v, textContent: names[v] })),
    );
    s.value = get();
    this.syncers.push(() => (s.value = get()));
    s.addEventListener('change', () => set(s.value as T));
    return h('label', { className: 'prop' }, [h('span', { textContent: label }), s]);
  }

  private check(label: string, get: () => boolean, set: (v: boolean) => void) {
    const c = h('input', { type: 'checkbox', checked: get() });
    this.syncers.push(() => (c.checked = get()));
    c.addEventListener('change', () => set(c.checked));
    return h('label', { className: 'check' }, [c, label]);
  }

  private note(get: () => string) {
    const el = h('div', { className: 'muted prop-note' });
    const show = () => (el.textContent = get());
    show();
    this.syncers.push(show);
    return el;
  }

  // ---- 変更 ----

  private obj<T extends BoardObject>(id: string): T {
    return this.editor.get(id) as T;
  }

  private update<T extends BoardObject>(id: string, fn: (o: T) => T, label = 'プロパティの変更') {
    const before = this.obj<T>(id);
    if (!before) return;
    this.editor.execute(new ReplaceObjects([before], [fn(structuredClone(before))], label));
  }

  private rectRows(title: string, get: () => RotRect, set: (r: RotRect) => void): HTMLElement[] {
    const field = (k: keyof RotRect, label: string, o: NumOpts = {}) =>
      this.num(
        label,
        () => get()[k],
        (v) => set({ ...get(), [k]: v }),
        o,
      );
    return [
      h('div', { className: 'prop-group', textContent: title }),
      h('div', { className: 'prop-grid' }, [
        field('x', 'X'),
        field('y', 'Y'),
        field('w', '幅', { min: 0.5 }),
        field('h', '高さ', { min: 0.5 }),
        field('angle', '角度', { unit: '°', step: 1 }),
      ]),
    ];
  }

  private objectRows(id: string): HTMLElement[] {
    const o = this.obj(id);
    const u = this.editor.board.scale.pxPerCm;
    const mm = (px: number) => `${((px / u) * 10).toFixed(2)} mm`;
    switch (o.type) {
      case 'nail': {
        const nail = () => this.obj<typeof o>(id);
        return [
          h('div', { className: 'prop-grid' }, [
            this.num(
              'X',
              () => nail().x,
              (v) => this.update<typeof o>(id, (n) => ({ ...n, x: v })),
            ),
            this.num(
              'Y',
              () => nail().y,
              (v) => this.update<typeof o>(id, (n) => ({ ...n, y: v })),
            ),
            this.num(
              '半径',
              () => nail().r,
              (v) => this.update<typeof o>(id, (n) => ({ ...n, r: v })),
              { min: 0.2, step: 0.05 },
            ),
          ]),
          this.note(() => `当たり判定の直径 ${mm(nail().r * 2)}`),
        ];
      }
      case 'wall': {
        const wall = () => this.obj<typeof o>(id);
        return [
          this.select<WallMaterial>(
            '材質',
            WALL_MATERIALS,
            MATERIAL_LABELS,
            () => wall().material,
            (v) => this.update<typeof o>(id, (w) => ({ ...w, material: v })),
          ),
          this.check(
            '閉じた図形',
            () => wall().closed,
            (v) => this.update<typeof o>(id, (w) => ({ ...w, closed: v && w.points.length >= 3 })),
          ),
          this.note(() => `頂点 ${wall().points.length} 個 (頂点編集ツール A で編集)`),
        ];
      }
      case 'windmill': {
        const wm = () => this.obj<typeof o>(id);
        const set = (k: 'x' | 'y' | 'r' | 'blades' | 'damping') => (v: number) =>
          this.update<typeof o>(id, (w) => ({ ...w, [k]: k === 'blades' ? Math.round(v) : v }));
        return [
          h('div', { className: 'prop-grid' }, [
            this.num('X', () => wm().x, set('x')),
            this.num('Y', () => wm().y, set('y')),
            this.num('半径', () => wm().r, set('r'), { min: 3 }),
            this.num('羽根', () => wm().blades, set('blades'), { min: 2, max: 12, digits: 0 }),
            this.num('減衰', () => wm().damping, set('damping'), { min: 0, step: 0.1 }),
          ]),
        ];
      }
      case 'pocket': {
        const p = () => this.obj<typeof o>(id);
        return [
          this.select<PocketKind>(
            '種類',
            POCKET_KINDS,
            POCKET_LABELS,
            () => p().kind,
            (v) => this.update<typeof o>(id, (x) => ({ ...x, kind: v })),
          ),
          this.num(
            '賞球',
            () => p().payout,
            (v) => this.update<typeof o>(id, (x) => ({ ...x, payout: Math.round(v) })),
            { min: 0, digits: 0, unit: '個' },
          ),
          ...this.rectRows(
            '入賞判定の範囲',
            () => p().rect,
            (r) => this.update<typeof o>(id, (x) => ({ ...x, rect: r })),
          ),
          this.check(
            '蓋 (閉じているあいだ入賞しない)',
            () => !!p().lid,
            (v) =>
              this.update<typeof o>(id, (x) => {
                if (v) return { ...x, lid: defaultLid(x.rect) };
                const { lid: _lid, ...rest } = x;
                return rest;
              }),
          ),
          ...(o.lid
            ? this.rectRows(
                '蓋',
                () => p().lid!,
                (r) => this.update<typeof o>(id, (x) => ({ ...x, lid: r })),
              )
            : []),
        ];
      }
      case 'gate':
      case 'display': {
        const g = () => this.obj<typeof o>(id);
        return this.rectRows(
          o.type === 'gate' ? 'ゲートの範囲' : '図柄を表示する範囲',
          () => g().rect,
          (r) => this.update<typeof o>(id, (x) => ({ ...x, rect: r })),
        );
      }
    }
  }

  private multiRows(sel: BoardObject[]): HTMLElement[] {
    const counts = new Map<string, number>();
    for (const o of sel) counts.set(objectLabel(o), (counts.get(objectLabel(o)) ?? 0) + 1);
    const rows: HTMLElement[] = [
      h('div', {
        className: 'muted',
        textContent: [...counts].map(([k, n]) => `${k} ${n}`).join(' / '),
      }),
    ];
    if (sel.every((o) => o.type === 'nail')) {
      const ids = sel.map((o) => o.id);
      rows.push(
        this.num(
          '半径 (一括)',
          () => (this.editor.get(ids[0]!) as { r: number } | undefined)?.r ?? 0,
          (v) => {
            const before = ids.map((id) => this.editor.get(id)!).filter(Boolean);
            const after = before.map((o) => ({ ...o, r: v }));
            this.editor.execute(new ReplaceObjects(before, after, '釘の半径の変更'));
          },
          { min: 0.2, step: 0.05 },
        ),
      );
    }
    return rows;
  }

  private boardRows(): HTMLElement[] {
    const ed = this.editor;
    const launcher = () => ed.board.launcher;
    const setL = (k: keyof LauncherDef) => (v: number) =>
      ed.execute(
        new SetBoardField('launcher', launcher(), { ...launcher(), [k]: v }, '発射装置の変更'),
      );
    const name = h('input', { type: 'text', value: ed.board.name, className: 'wide' });
    this.syncers.push(() => {
      if (document.activeElement !== name) name.value = ed.board.name;
    });
    name.addEventListener('change', () =>
      ed.execute(new SetBoardField('name', ed.board.name, name.value, '盤面名の変更')),
    );
    return [
      h('label', { className: 'prop' }, [h('span', { textContent: '名前' }), name]),
      this.num(
        '縮尺',
        () => ed.board.scale.pxPerCm,
        (v) => ed.execute(new SetBoardField('scale', ed.board.scale, { pxPerCm: v }, '縮尺の変更')),
        { min: 1, step: 0.1, unit: 'px/cm' },
      ),
      h('div', { className: 'prop-group', textContent: '発射装置' }),
      h('div', { className: 'prop-grid' }, [
        this.num('X', () => launcher().x, setL('x')),
        this.num('Y', () => launcher().y, setL('y')),
        this.num('角度', () => launcher().angle, setL('angle'), { unit: '°', step: 0.5 }),
        this.num('間隔', () => launcher().rate, setL('rate'), { min: 1, unit: '発/分', digits: 0 }),
        this.num('初速 0%', () => launcher().speedMin, setL('speedMin'), { min: 0, unit: 'cm/s' }),
        this.num('初速 100%', () => launcher().speedMax, setL('speedMax'), {
          min: 0,
          unit: 'cm/s',
        }),
        this.num('曲線', () => launcher().curve, setL('curve'), { min: 0.1, step: 0.1 }),
        this.num(
          'ばらつき',
          () => launcher().spread * 100,
          (v) => setL('spread')(v / 100),
          {
            min: 0,
            step: 0.1,
            unit: '%',
          },
        ),
      ]),
      h('p', {
        className: 'help',
        textContent: 'オブジェクトを選ぶと、そのプロパティを編集できます。',
      }),
    ];
  }
}
