import { downloadText, safeFileName } from '@/board/storage';
import {
  reportToCsv,
  reportToJson,
  STOP_REASON_LABELS,
  type AutoPlayReport,
} from '@/auto/AutoPlayStats';
import { POCKET_LABELS } from '@/editor/objectOps';
import type { PocketKind } from '@/board/types';
import { fmt, h } from './dom';

const KINDS: PocketKind[] = ['start', 'electric', 'attacker', 'general'];

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m > 0 ? `${m}分${s.toFixed(1)}秒` : `${s.toFixed(1)}秒`;
}

/** 持ち玉推移のグラフ (横軸: 発射数、縦軸: 差玉と持ち玉) を描く */
export function drawHistoryGraph(canvas: HTMLCanvasElement, report: AutoPlayReport): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 300;
  const cssH = canvas.clientHeight || 160;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const pts = report.history;
  if (pts.length < 2) return;
  const pad = { l: 44, r: 8, t: 10, b: 20 };
  const w = cssW - pad.l - pad.r;
  const hgt = cssH - pad.t - pad.b;
  const maxX = Math.max(1, ...pts.map((p) => p.shots));
  const ys = pts.flatMap((p) => [p.net, p.held]);
  let minY = Math.min(0, ...ys);
  let maxY = Math.max(0, ...ys);
  if (maxY - minY < 10) {
    maxY += 5;
    minY -= 5;
  }
  const X = (v: number) => pad.l + (v / maxX) * w;
  const Y = (v: number) => pad.t + (1 - (v - minY) / (maxY - minY)) * hgt;

  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#b89ab8';
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = minY + ((maxY - minY) * i) / 4;
    const y = Y(v);
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + w, y);
    ctx.stroke();
    ctx.fillText(fmt(Math.round(v)), 2, y + 3);
  }
  ctx.fillText(`${fmt(maxX)} 発`, pad.l + w - 44, cssH - 4);
  // 0 の線
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.moveTo(pad.l, Y(0));
  ctx.lineTo(pad.l + w, Y(0));
  ctx.stroke();

  const line = (key: 'net' | 'held', color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) =>
      i === 0 ? ctx.moveTo(X(p.shots), Y(p[key])) : ctx.lineTo(X(p.shots), Y(p[key])),
    );
    ctx.stroke();
  };
  line('held', '#5fb8ff');
  line('net', '#ff5fa8');
  // 大当りの位置
  ctx.fillStyle = '#ffd24a';
  for (let i = 1; i < pts.length; i++) {
    if (pts[i]!.jackpots > pts[i - 1]!.jackpots) {
      ctx.beginPath();
      ctx.arc(X(pts[i]!.shots), Y(pts[i]!.net), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 自動プレイの結果レポート */
export class ReportView {
  readonly el: HTMLElement;

  constructor(readonly report: AutoPlayReport) {
    const r = report;
    const rows: [string, string][] = [
      ['停止理由', STOP_REASON_LABELS[r.reason]],
      ['シード', String(r.seed)],
      ['ゲーム内時間', fmtTime(r.simTime)],
      ['発射数', `${fmt(r.shots)} 発`],
      ['回転数', `${fmt(r.spins)} 回 (通常時 ${fmt(r.normalSpins)} 回)`],
      ['大当り / 初当り', `${fmt(r.jackpots)} 回 / ${fmt(r.firstHits)} 回`],
      ['回転率', r.rotationRate === null ? '—' : `${r.rotationRate.toFixed(1)} 回 / 1000円`],
      ['総賞球', `${fmt(r.payout)} 個`],
      ['差玉', `${r.net > 0 ? '+' : ''}${fmt(r.net)} 個`],
      ['出玉率', r.payoutRate === null ? '—' : `${(r.payoutRate * 100).toFixed(1)} %`],
      ['投資', `${fmt(r.invested)} 円 (${fmt(r.lent)} 玉)`],
      ['最終持ち玉', `${fmt(r.finalHeld)} 個`],
    ];
    const pocketRows = KINDS.map((k) => [
      POCKET_LABELS[k],
      `${fmt(r.pockets[k])} 個 (賞球 ${fmt(r.payoutByKind[k])})`,
    ]) as [string, string][];
    const table = (data: [string, string][]) =>
      h(
        'table',
        { className: 'report-table' },
        data.map(([k, v]) =>
          h('tr', {}, [h('th', { textContent: k }), h('td', { textContent: v })]),
        ),
      );
    const canvas = h('canvas', { className: 'report-graph' });
    const json = h('button', { textContent: 'JSON で保存' });
    const csv = h('button', { textContent: 'CSV で保存' });
    const base = `autoplay-${safeFileName(r.boardName)}-${r.seed}`;
    json.addEventListener('click', () => downloadText(`${base}.json`, reportToJson(r)));
    csv.addEventListener('click', () => downloadText(`${base}.csv`, reportToCsv(r), 'text/csv'));
    this.el = h('div', { className: 'report' }, [
      h('h3', { textContent: '結果レポート' }),
      table(rows),
      h('h4', { textContent: '入賞口別の入賞数' }),
      table(pocketRows),
      h('h4', {}, [
        '持ち玉推移 (',
        h('span', { className: 'legend net', textContent: '差玉' }),
        ' / ',
        h('span', { className: 'legend held', textContent: '持ち玉' }),
        ' / ',
        h('span', { className: 'legend jp', textContent: '● 大当り' }),
        ')',
      ]),
      canvas,
      h('div', { className: 'row' }, [json, csv]),
    ]);
    // レイアウトが決まってから描く
    requestAnimationFrame(() => drawHistoryGraph(canvas, r));
  }
}
