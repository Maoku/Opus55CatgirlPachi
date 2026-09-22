import { DEFAULT_LAUNCHER, DEFAULT_PHYSICS, type BoardData, type BoardObject } from '@/board/types';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { loadRapier } from '@/physics/rapier';

/** 1000 x 1000 px の遊技領域を持つテスト用の盤面 */
export function testBoard(objects: BoardObject[], overrides: Partial<BoardData> = {}): BoardData {
  return {
    schemaVersion: 1,
    name: 'test',
    image: { src: 'test.png', width: 1000, height: 1000 },
    scale: { pxPerCm: 21.6 },
    physics: structuredClone(DEFAULT_PHYSICS),
    playfield: [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ],
    launcher: { ...DEFAULT_LAUNCHER },
    objects,
    ...overrides,
  };
}

export async function makeWorld(objects: BoardObject[], overrides: Partial<BoardData> = {}) {
  const R = await loadRapier();
  return new PhysicsWorld(R, testBoard(objects, overrides));
}

export function stepFor(world: PhysicsWorld, seconds: number) {
  const n = Math.round(seconds / world.params.timestep);
  const events = [];
  for (let i = 0; i < n; i++) {
    world.step();
    events.push(...world.drainEvents());
  }
  return events;
}
