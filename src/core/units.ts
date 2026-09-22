/** 盤面座標 (画像 px) と物理座標 (cm) の換算 */
export class Units {
  constructor(readonly pxPerCm: number) {}

  toCm(px: number): number {
    return px / this.pxPerCm;
  }

  toPx(cm: number): number {
    return cm * this.pxPerCm;
  }

  /** mm 表示用 */
  toMm(px: number): number {
    return (px / this.pxPerCm) * 10;
  }
}
