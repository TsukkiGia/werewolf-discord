import type { AssignedRole } from '../types.js';
import { chooseSetup } from '../balancing/chooseSetup.js';

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function assignRolesForPlayerIds(playerIds: string[]): AssignedRole[] {
  if (playerIds.length === 0) return [];

  const shuffledPlayers = shuffle(playerIds);
  const setup = chooseSetup(playerIds.length);

  const assignments: AssignedRole[] = [];

  for (let i = 0; i < playerIds.length; i += 1) {
    const userId = shuffledPlayers[i]!;
    const role = setup[i];
    if (!role) {
      throw new Error('chooseSetup did not return enough roles for all players');
    }
    const alignment = role === 'werewolf' ? 'wolf' : 'town';

    assignments.push({ userId, role, alignment });
  }

  return assignments;
}
