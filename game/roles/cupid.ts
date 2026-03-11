import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const CupidRole: RoleDefinition = {
  name: 'cupid',
  alignment: 'town',
  description:
    'Chooses two players to be Lovers at the start of the game. If one Lover dies, the other dies of sorrow. ' +
    'Lovers know each other but not each other’s roles. If both Lovers survive to the end and at least one of them ' +
    'was on the winning team, they both win together. If they are the last two alive, they win regardless of teams.',
  unique: true,
  minPlayers: 6,
  nightAction: {
    kind: 'link',
    target: 'player',
    canTargetSelf: false,
    prompt: 'Night {night}: choose two players to bind as Lovers.',
  },
  isNightActionRequired: ({ nightNumber }) => nightNumber === 1,
  // Cupid believes only that they are Cupid; we keep the intro clear and
  // explain the Lovers mechanic here.
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are CUPID. On the first night, you will secretly choose two players to become Lovers. ' +
    'They will learn who each other are, but not each other’s roles. If one dies, the other dies of sorrow. ' +
    'If both survive and at least one is on the winning side, they both win together.',
};
