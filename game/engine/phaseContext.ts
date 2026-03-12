import {
  getGame,
  getPlayersForGame,
  getNightActionsForNight,
  getVotesForDay,
  getPendingHunterShot,
} from '../../db.js';
import type { GameRow } from '../../db/games.js';
import type { GamePlayerState } from '../../db/players.js';
import type { NightActionRow } from '../../db/nightActions.js';
import type { DayVoteRow } from '../../db/votes.js';
import type { HunterShotRow } from '../../db/hunterShots.js';
import { WOLF_PACK_ROLES, type RoleName } from '../types.js';
import { evaluateNightResolution } from './nightResolution.js';
import { evaluateDayResolution } from './dayResolution.js';

// Night phase inputs before resolution is claimed.
export interface NightContext {
  game: GameRow;
  nightNumber: number;
  hasWolfExtraKill: boolean;
  playersBefore: GamePlayerState[];
  allActions: NightActionRow[];
  actionsRound1: NightActionRow[];
  actionsRound2: NightActionRow[];
}

// Night phase once we know it is ready to resolve.
export interface NightResolutionContext extends NightContext {
  killTargetsRound1: string[];
  killTargetsRound2: string[];
  protectTargets: string[];
  visitActions: { harlotId: string; targetId: string }[];
}

// Day phase inputs before resolution is claimed.
export interface DayContext {
  game: GameRow;
  dayNumber: number;
  round: 1 | 2;
  isSecondLynch: boolean;
  isFirstLynchOfDouble: boolean;
  playersBefore: GamePlayerState[];
  votes: DayVoteRow[];
}

export type DayResolutionKind = 'pending' | 'no_lynch' | 'lynch';

// Day phase once we have a resolution.
export interface DayResolutionContext extends DayContext {
  resolutionKind: DayResolutionKind;
  lynchId: string | null;
}

// Optional helper context for hunter shots.
export interface HunterShotContext {
  game: GameRow | null;
  shot: HunterShotRow;
  playersBefore: GamePlayerState[];
  targetId: string | null;
}

export async function buildNightContext(gameId: string): Promise<NightContext | null> {
  const game = await getGame(gameId);
  if (!game || game.status !== 'night') return null;

  const nightNumber = game.current_night || 1;
  const hasWolfExtraKill = (game.wolf_extra_kills_next_night ?? 0) > 0;
  const playersBefore = await getPlayersForGame(gameId);
  const allActions = await getNightActionsForNight(gameId, nightNumber);
  const actionsRound1 = allActions.filter((a) => a.round === 1);
  const actionsRound2 = allActions.filter((a) => a.round === 2);

  return {
    game,
    nightNumber,
    hasWolfExtraKill,
    playersBefore,
    allActions,
    actionsRound1,
    actionsRound2,
  };
}

export function buildNightResolutionContext(
  base: NightContext,
): { state: 'pending' } | { state: 'ready'; ctx: NightResolutionContext } {
  const nightResolution = evaluateNightResolution(
    base.playersBefore,
    base.actionsRound1,
    base.nightNumber,
  );
  if (nightResolution.state === 'pending') {
    return { state: 'pending' };
  }

  const { killTargets: killTargetsRound1, protectTargets, visitActions } = nightResolution;

  const killTargetsRound2 = base.hasWolfExtraKill
    ? base.actionsRound2
        .filter(
          (a) =>
            a.action_kind === 'kill' &&
            a.target_id &&
            WOLF_PACK_ROLES.has(a.role as RoleName),
        )
        .map((a) => a.target_id as string)
    : [];

  const ctx: NightResolutionContext = {
    ...base,
    killTargetsRound1,
    killTargetsRound2,
    protectTargets,
    visitActions,
  };

  return { state: 'ready', ctx };
}

export async function buildDayContext(gameId: string): Promise<DayContext | null> {
  const game = await getGame(gameId);
  if (!game || (game.status !== 'day' && game.status !== 'day_second_lynch')) {
    return null;
  }

  const dayNumber = game.current_day || 1;
  const isSecondLynch = game.status === 'day_second_lynch';
  const isFirstLynchOfDouble =
    !isSecondLynch &&
    game.troublemaker_double_lynch_day != null &&
    game.troublemaker_double_lynch_day === dayNumber;

  const round: 1 | 2 = isSecondLynch ? 2 : 1;
  const playersBefore = await getPlayersForGame(gameId);
  const votes = await getVotesForDay(gameId, dayNumber, round);

  return {
    game,
    dayNumber,
    round,
    isSecondLynch,
    isFirstLynchOfDouble,
    playersBefore,
    votes,
  };
}

export function buildDayResolutionContext(
  base: DayContext,
  { force }: { force: boolean },
): DayResolutionContext {
  const res = evaluateDayResolution(base.playersBefore, base.votes, { force });

  if (res.state === 'pending') {
    return {
      ...base,
      resolutionKind: 'pending',
      lynchId: null,
    };
  }

  if (res.state === 'no_lynch') {
    return {
      ...base,
      resolutionKind: 'no_lynch',
      lynchId: null,
    };
  }

  return {
    ...base,
    resolutionKind: 'lynch',
    lynchId: res.lynchId,
  };
}

export async function buildHunterShotContext(
  gameId: string,
  hunterId: string,
  targetId: string | null,
): Promise<HunterShotContext | null> {
  const shot = await getPendingHunterShot(gameId, hunterId);
  if (!shot) return null;

  const playersBefore = await getPlayersForGame(gameId);
  const game = await getGame(gameId);

  return {
    game,
    shot,
    playersBefore,
    targetId,
  };
}

