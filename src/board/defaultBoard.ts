import defaultJson from '@/assets/boards/default.json';
import { parseBoard } from './migrate';
import type { BoardData } from './types';

/** pachi.png に合わせて作ったデフォルト盤面 (リセット時にもこれに戻す) */
export function createDefaultBoard(): BoardData {
  return parseBoard(structuredClone(defaultJson));
}
