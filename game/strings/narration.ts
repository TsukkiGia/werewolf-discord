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

export function revealWolvesLine(wolfMentions: string): string {
  const variants = [
    `The werewolves were: ${wolfMentions}.`,
    `These players were the wolves: ${wolfMentions}.`,
    `At the end, the wolves were: ${wolfMentions}.`,
  ];
  return pickRandom(variants);
}

export function nightVictimLine(userId: string, alignment: Alignment | null): string {
  const summary = teamSummary(alignment);
  const variants = [
    `<@${userId}> was killed during the night. They were ${summary}.`,
    `By morning, <@${userId}> is found dead. They were ${summary}.`,
    `<@${userId}> did not survive the night. They were ${summary}.`,
  ];
  return pickRandom(variants);
}

export function lynchResultLine(userId: string, alignment: Alignment | null): string {
  return `Day vote results: <@${userId}> was lynched. They were ${teamSummary(alignment)}.`;
}

export function hunterShotLine(hunterId: string, targetId: string, alignment: Alignment | null | undefined): string {
  return `<@${hunterId}> was eliminated, but took <@${targetId}> down with them. They were ${teamSummary(alignment)}.`;
}

export function hunterPassLine(hunterId: string): string {
  return `<@${hunterId}> was eliminated and chose not to shoot.`;
}

export function finalRolesLines(players: GamePlayerState[]): string[] {
  const roleLines =
    players.length > 0
      ? players.map((p) => `<@${p.user_id}> — **${p.role}**`)
      : ['No players were recorded for this game.'];
  return ['Final roles:', ...roleLines];
}
