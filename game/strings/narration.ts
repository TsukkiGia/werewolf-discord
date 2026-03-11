import type { Alignment } from '../types.js';

function pickRandom<T>(items: T[]): T {
  if (items.length === 0) {
    throw new Error('pickRandom called with empty array');
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index]!;
}

export function dayStartLine(dayNumber: number): string {
  const variants = [
    `Day ${dayNumber} dawns over the village. You have 30 heartbeats to whisper and scheme before the gallows are prepared.`,
    `The bells toll for Day ${dayNumber}. Take a brief moment to confer before the vote is called.`,
    `Sunlight creeps across the thatched roofs – Day ${dayNumber} begins. Speak quickly; judgement draws near.`,
    `Day ${dayNumber} rises like a pale blade over the village. You have a short while to trade rumors before the noose is tightened.`,
  ];
  return pickRandom(variants);
}

export function nightFallsLine(): string {
  const variants = [
    'Night falls like a heavy cloak over the village...',
    'Darkness settles in and shutters are drawn. Night falls...',
    'The last candle is snuffed out – night descends upon the village...',
    'Shadows stretch long as the sun slips away. Night falls...',
  ];
  return pickRandom(variants);
}

export function noLynchLine(dayNumber: number): string {
  const variants = [
    `Day ${dayNumber} ends in uneasy silence. No one is led to the gallows.`,
    `The villagers argue until the light fades, but no rope is cast on Day ${dayNumber}.`,
    `Day ${dayNumber} closes without a verdict. No one is lynched.`,
    `Mistrust hangs in the air, but on Day ${dayNumber} no neck meets the noose.`,
  ];
  return pickRandom(variants);
}

export function dawnNoVictimLine(): string {
  const variants = [
    'Dawn breaks over a mercifully quiet village. No bodies are found this morning.',
    'First light spills into the square – and to everyone’s surprise, no one has been taken in the night.',
    'As the sun crests the hills, the villagers find every door still closed and every bed still filled.',
    'Morning mist curls through empty streets; no fresh graves are needed this dawn.',
  ];
  return pickRandom(variants);
}

export function dawnIntroLine(): string {
  const variants = [
    'Dawn breaks.',
    'Grey light creeps over the village.',
    'A pale sunrise washes over the thatched roofs.',
    'Morning comes, thin and cold.',
  ];
  return pickRandom(variants);
}

export function doctorSavedRumorLine(): string {
  const variants = [
    'Rumor spreads through the village: claws found their mark last night, but a watchful healer turned death aside.',
    'Whispers circle the square – the wolves struck in the dark, yet a swift-handed doctor pulled their prey back from the brink.',
    'The villagers murmur that someone was marked for death, but the doctor’s art kept the grave at bay.',
    'They say the wolves chose a victim, but holy herbs and steady hands denied them their feast.',
  ];
  return pickRandom(variants);
}

export function hunterResolveLine(): string {
  const variants = [
    "The Hunter's eyes flash with grim resolve...",
    'Steel glints as the Hunter steadies their final shot...',
    'With a ragged breath, the Hunter raises their weapon one last time...',
    'Even in death, the Hunter refuses to go quietly...',
  ];
  return pickRandom(variants);
}

export function townWinLine(): string {
  const variants = [
    'With the last wolf unmasked, the village breathes easy. Town wins!',
    'The final howl is silenced and the village is spared. Town claims victory!',
    'The noose and the daylight have done their work – the wolves are no more. Town triumphs!',
  ];
  return pickRandom(variants);
}

export function wolfWinLine(): string {
  const variants = [
    'As night falls for the last time, the remaining villagers are outnumbered. Wolves seize the village!',
    'The pack now prowls openly through empty streets. The wolves have won!',
    'With only frightened stragglers left, the village falls into the jaws of the wolves.',
  ];
  return pickRandom(variants);
}

export function revealWolvesLine(wolfMentions: string): string {
  const variants = [
    `The werewolves were: ${wolfMentions}.`,
    `Those who walked as wolves in the dark: ${wolfMentions}.`,
    `Revealed at last, the wolves among you were ${wolfMentions}.`,
  ];
  return pickRandom(variants);
}

export function nightVictimLine(userId: string, alignment: Alignment | null): string {
  const wasWolf = alignment === 'wolf';
  const roleSummary = wasWolf ? 'a **wolf**' : 'not a **wolf**';

  const variants = [
    `<@${userId}> is found lifeless at dawn. They were ${roleSummary}.`,
    `In the morning light, the village discovers <@${userId}>'s body. They were ${roleSummary}.`,
    `The wolves have feasted – <@${userId}> lies still. They were ${roleSummary}.`,
    `A cry goes up: <@${userId}> will not see another sunrise. They were ${roleSummary}.`,
  ];
  return pickRandom(variants);
}

