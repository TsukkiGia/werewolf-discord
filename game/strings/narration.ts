import type { Alignment } from '../types.js';
import type { GamePlayerState } from '../../db/players.js';

function pickRandom<T>(items: T[]): T {
  if (items.length === 0) {
    throw new Error('pickRandom called with empty array');
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index]!;
}

function teamSummary(alignment: Alignment | null | undefined): string {
  return alignment === 'wolf' ? 'on the **wolf team**' : 'not on the **wolf team**';
}

// Toggle: when true, deaths reveal the exact role instead of just alignment.
const REVEAL_ROLE_ON_DEATH = false;

export function deathSummary(
  alignment: Alignment | null | undefined,
  role?: string | null,
): string {
  if (REVEAL_ROLE_ON_DEATH && role) {
    return `**${role}**`;
  }
  return teamSummary(alignment);
}

export function dayStartLine(dayNumber: number): string {
  const variants = [
    `Day ${dayNumber} begins. You have 30 seconds to talk before voting starts.`,
    `Day ${dayNumber} is here. Use this short time to discuss before the vote.`,
    `It is now Day ${dayNumber}. Speak quickly – voting starts soon.`,
  ];
  return pickRandom(variants);
}

export function nightFallsLine(): string {
  const variants = [
    'Night falls over the village...',
    'The sun sets and night begins...',
    'Darkness returns. Night falls...',
  ];
  return pickRandom(variants);
}

export function noLynchLine(dayNumber: number): string {
  const variants = [
    `Day ${dayNumber} ends with no majority. No one is lynched.`,
    `Day ${dayNumber} is over. No one receives enough votes to be lynched.`,
    `Day ${dayNumber} ends in a stalemate. No one is lynched.`,
  ];
  return pickRandom(variants);
}

export function dawnNoVictimLine(): string {
  const variants = [
    'Dawn breaks. No one was eliminated during the night.',
    'Morning comes, and everyone is still alive.',
    'The village wakes to find that no one died in the night.',
  ];
  return pickRandom(variants);
}

export function dawnIntroLine(): string {
  const variants = [
    'Dawn breaks.',
    'Morning comes.',
    'A new day begins.',
  ];
  return pickRandom(variants);
}

export function doctorSavedRumorLine(): string {
  const variants = [
    'Rumor spreads that the wolves tried to kill someone, but the doctor protected them.',
    'The villagers hear that a wolf attack was stopped by the doctor last night.',
    'People whisper that someone should be dead, but the doctor saved them.',
  ];
  return pickRandom(variants);
}

export function hunterResolveLine(): string {
  const variants = [
    "The Hunter's eyes flash with resolve...",
    'The Hunter steadies their final shot...',
    'Even in death, the Hunter is ready to fire one last time...',
  ];
  return pickRandom(variants);
}

export function townWinLine(): string {
  const variants = [
    'All the wolves are gone. Town wins!',
    'The last wolf has fallen. Town wins!',
    'The village is safe. Town wins!',
  ];
  return pickRandom(variants);
}

export function wolfWinLine(): string {
  const variants = [
    'The wolves now outnumber the town. Wolves win!',
    'The village falls under wolf control. Wolves win!',
    'No one can stop the pack now. Wolves win!',
  ];
  return pickRandom(variants);
}

export function arsonistWinLine(): string {
  const variants = [
    'The last embers die out. The Arsonist stands alone amid the ashes. Arsonist wins!',
    'The village is nothing but char and smoke now. Only the Arsonist walks away. Arsonist wins!',
    'Every house is burned, every foe reduced to ash. The Arsonist is the sole survivor — Arsonist wins!',
  ];
  return pickRandom(variants);
}

export function revealWolvesLine(wolfMentions: string): string {
  const variants = [
    `The werewolves were: ${wolfMentions}.`,
    `These players were the wolves: ${wolfMentions}.`,
    `At the end, the wolves were: ${wolfMentions}.`,
  ];
  return pickRandom(variants);
}

export function nightVictimLine(victim: GamePlayerState): string {
  const summary = deathSummary(victim.alignment as Alignment | null, victim.role);
  const variants = [
    `<@${victim.user_id}> was killed during the night. They were ${summary}.`,
    `By morning, <@${victim.user_id}> is found dead. They were ${summary}.`,
    `<@${victim.user_id}> did not survive the night. They were ${summary}.`,
  ];
  return pickRandom(variants);
}

export function lynchResultLine(victim: GamePlayerState): string {
  const summary = deathSummary(victim.alignment as Alignment | null, victim.role);
  return `Day vote results: <@${victim.user_id}> was lynched. They were ${summary}.`;
}

export function hunterShotLine(
  hunter: GamePlayerState,
  target: GamePlayerState,
): string {
  const summary = deathSummary(target.alignment as Alignment | null, target.role);
  return `<@${hunter.user_id}> was eliminated, but took <@${target.user_id}> down with them. They were ${summary}.`;
}

export function hunterPassLine(hunterId: string): string {
  return `<@${hunterId}> was eliminated and chose not to shoot.`;
}

export function harlotVisitedWolfLine(targetId: string): string {
  const variants = [
    `You slipped into <@${targetId}>'s home — and found a wolf waiting. You never made it back.`,
    `Your visit to <@${targetId}> was your last. They were a wolf, and you paid for it with your life.`,
    `<@${targetId}> welcomed you in with a smile — then bared their fangs. You did not survive the night.`,
  ];
  return pickRandom(variants);
}

export function harlotVisitedTargetLine(targetId: string): string {
  const variants = [
    `You visited <@${targetId}> — and the wolves came for them too. You were caught in the crossfire and did not survive.`,
    `Terrible timing. The wolves struck <@${targetId}> the same night you visited. You did not make it out.`,
    `You chose <@${targetId}> to visit, but so did the wolves. You were in the wrong place at the wrong time.`,
  ];
  return pickRandom(variants);
}

export function harlotVisitNotificationLine(): string {
  const variants = [
    'Someone slipped into your bed last night and gave you the ride of your life. By dawn, they were gone without a trace.',
    'You woke sore and smiling — someone slid under your covers and gave you the ride of your life, then vanished before sunrise.',
    'In the dark, a stranger eased into your bed and made the night unforgettable. By morning, they were nowhere to be found.',
  ];
  return pickRandom(variants);
}

export function harlotSafeVisitLine(targetId: string): string {
  const variants = [
    `You spend the night with <@${targetId}>. Every shadow looks like fangs, but dawn finds you both alive.`,
    `You jolt awake in <@${targetId}>'s bed, sure you heard claws. It's nothing — they are no wolf.`,
    `You gamble on <@${targetId}> and win. No claws, no blood — you slip home before sunrise.`,
  ];
  return pickRandom(variants);
}

export function wolfTargetNotHomeLine(targetId: string): string {
  const variants = [
    `You crept to <@${targetId}>'s door — but they weren't home. Your kill was wasted.`,
    `<@${targetId}> was out for the night. You waited, but they never came back. Your kill is wasted.`,
    `The house was empty. <@${targetId}> was not home tonight. You return with blood on no one's hands.`,
  ];
  return pickRandom(variants);
}

export function doctorProtectingWolfDeathLine(doctorId: string): string {
  const variants = [
    `<@${doctorId}> tried to shield a wolf in disguise and was killed for it.`,
    `<@${doctorId}> rushed to protect a “villager” who was really a wolf — they never made it back.`,
    `<@${doctorId}> misread the signs, guarded a wolf, and paid with their life.`,
  ];
  return pickRandom(variants);
}

export function harlotVisitWolfDeathLine(harlotId: string): string {
  const variants = [
    `<@${harlotId}> slipped into the wrong bed for the night of their life — and their last, when the wolf bared its fangs.`,
    `What started as the ride of <@${harlotId}>'s life ended with a wolf at their throat.`,
    `<@${harlotId}> chased midnight thrills and dove straight into a wolf’s embrace. By dawn, they were gone.`,
  ];
  return pickRandom(variants);
}

export function harlotVisitWolfVictimDeathLine(harlotId: string): string {
  const variants = [
    `<@${harlotId}> slipped into the wrong bed for a wild night — when the wolves crashed in, the fun ended in blood.`,
    `What began as the ride of <@${harlotId}>'s life ended in a massacre when the wolves tore through the room.`,
    `<@${harlotId}> was tangled up in someone else’s midnight thrills when the pack struck. By dawn, <@${harlotId}> was dead.`,
  ];
  return pickRandom(variants);
}

export function chemistSelfDeathLine(chemistId: string): string {
  const variants = [
    `<@${chemistId}> was found in a haze of shattered vials and toxic fumes. Their last batch of potions clearly went wrong.`,
    `By morning, <@${chemistId}> lay lifeless amid broken glass and strange-colored stains — a victim of their own concoctions.`,
    `The village finds <@${chemistId}> collapsed in their lab, surrounded by spilled brews. Whatever they drank, it was deadly.`,
  ];
  return pickRandom(variants);
}

export function chemistTargetDeathLine(victimId: string): string {
  const variants = [
    `<@${victimId}> is discovered dead, reeking of strange potions. Last night’s “tasting session” was clearly fatal.`,
    `At dawn, <@${victimId}> is found with blackened lips and shattered vials nearby — poisoned by a bad brew.`,
    `<@${victimId}> never woke up after sharing mysterious potions in the night. The smell of alchemy still hangs in the air.`,
  ];
  return pickRandom(variants);
}

export function arsonistFireDeathLine(victimId: string): string {
  const variants = [
    `<@${victimId}> is found in a charred ruin, the house burned to the ground in an unnatural blaze.`,
    `When <@${victimId}> finally stumbled home, the kerosene-soaked house erupted around them. They never made it back out.`,
    `The village wakes to the smell of ash — <@${victimId}>'s house burned in the night, leaving no survivors inside.`,
  ];
  return pickRandom(variants);
}

export function finalRolesLines(players: GamePlayerState[]): string[] {
  const roleLines =
    players.length > 0
      ? players.map((p) => `<@${p.user_id}> — **${p.role}**`)
      : ['No players were recorded for this game.'];
  return ['Final roles:', ...roleLines];
}
