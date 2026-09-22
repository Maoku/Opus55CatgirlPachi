import { createSampleBoard } from './sampleBoard';
import type { BoardData } from './types';

/** デフォルト盤面 (リセット時にもこれに戻す) */
export function createDefaultBoard(): BoardData {
  return createSampleBoard();
}
