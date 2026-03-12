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

export function doctorSavedTargetLine(): string {
  const variants = [
    'You wake sore and shaken, with flashes of claws and teeth — and a pair of steady hands dragging you back from the brink. The wolves came for you, but the doctor saved your life.',
    'Your last memory of the night is fur, fangs, and sudden pain — then bandages and whispered instructions. Someone, somewhere, patched you up. The wolves tried to kill you, but the doctor stood between you and the grave.',
    'You should not be alive. The wolves tore into you last night, but a doctor worked through the dark to pull you back from death.',
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

export function loversWinAloneLine(loverAId: string, loverBId: string): string {
  const variants = [
    `In the end, only two hearts are still beating. <@${loverAId}> and <@${loverBId}> stand alone together — the Lovers win the game.`,
    `All factions fall silent but two. Bound by fate, <@${loverAId}> and <@${loverBId}> survive as the last pair alive. Love wins tonight.`,
    `When the dust settles, only the Lovers remain: <@${loverAId}> and <@${loverBId}>. Every side lost — except theirs.`,
  ];
  return pickRandom(variants);
}

export function loversAlsoWinLine(loverAId: string, loverBId: string): string {
  const variants = [
    `Quietly, a secondary victory blooms: the Lovers <@${loverAId}> and <@${loverBId}> survive together and share in the winning side’s glory.`,
    `Love endures the carnage — <@${loverAId}> and <@${loverBId}> both live and claim victory alongside the winning team.`,
    `Amid the cheers, two hearts celebrate their own pact: the Lovers <@${loverAId}> and <@${loverBId}> have also won together.`,
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
  const variants = [
    `<@${hunterId}> was eliminated, but lowered their weapon and let the village face the next night without a final shot.`,
    `Even in death, <@${hunterId}> held their fire. No last bullet flies from the Hunter’s gun.`,
    `<@${hunterId}> falls in silence, choosing not to pull the trigger one last time.`,
  ];
  return pickRandom(variants);
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
    `You spend the night with <@${targetId}>. Every shadow looks like fangs, but by dawn you’re sure: they are not a wolf.`,
    `You jolt awake in <@${targetId}>'s bed, sure you heard claws. It was just the wind — <@${targetId}> is no wolf.`,
    `You gamble on visiting <@${targetId}> and win. No claws, no blood — and you leave knowing they are not a wolf.`,
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

export function wolfBlockedByDoctorLine(targetId: string): string {
  const variants = [
    `You slipped into <@${targetId}>'s home hungry for blood — but a doctor barred your path. Your kill was stopped.`,
    `You lunged for <@${targetId}>, only to meet steel and medicine instead of flesh. The doctor turned your attack aside.`,
    `Claws flashed, fangs bared — and then a doctor dragged <@${targetId}> out of your reach. Tonight, your hunt was broken by a healer.`,
  ];
  return pickRandom(variants);
}

export function wolfMissedYouAwayLine(): string {
  const variants = [
    'In the morning, you hear hushed voices: the wolves clawed at your door last night, but found only an empty house. Being out may have saved your life.',
    'Rumor spreads that wolves stalked your doorstep while you were gone. Your house is scarred, but you are alive.',
    'By dawn, the village is whispering: the wolves came hunting for you, but you were nowhere to be found.',
  ];
  return pickRandom(variants);
}

export function wolfKillDmLine(): string {
  const variants = [
    'In the dead of night, the wolves found you. Teeth flashed, claws tore, and your story ended in the dark.',
    'You remember the sound of paws in the grass, a growl in the dark, and then nothing. The wolves devoured you in the night.',
    'The last thing you felt was hot breath at your throat and the crush of fangs. The wolves feasted — and you were the meal.',
  ];
  return pickRandom(variants);
}

export function wolfCubDeathPackLine(cubId: string): string {
  const variants = [
    `A young howl goes silent. The Wolf Cub <@${cubId}> has fallen, and the pack feels the loss like a wound.`,
    `News spreads through the shadows: the Wolf Cub <@${cubId}> is dead. Grief twists quickly into rage among the pack.`,
    `Somewhere in the dark, a small, familiar presence vanishes. The Wolf Cub <@${cubId}> will hunt no more.`,
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

export function loverSorrowDeathLine(victimId: string, partnerId: string | undefined): string {
  const partnerMention = partnerId ? `<@${partnerId}>` : 'their lost lover';
  const variants = [
    `<@${victimId}> could not bear life without ${partnerMention}. They died of a broken heart.`,
    `Grief proves fatal: after ${partnerMention} fell, <@${victimId}> slipped away in sorrow.`,
    `The village finds <@${victimId}> gone before dawn, a victim not of claws or fire but of heartbreak for ${partnerMention}.`,
  ];
  return pickRandom(variants);
}

export function arsonistFireHomeDeathLine(victimId: string): string {
  const variants = [
    `<@${victimId}> is found in a charred ruin, the house burned to the ground in an unnatural blaze.`,
    `Only scorched beams remain where <@${victimId}>'s home once stood. Their body is recovered from the ashes.`,
    `The village wakes to a roaring fire that has already done its work — <@${victimId}> burned with their home.`,
  ];
  return pickRandom(variants);
}

export function arsonistFireAwayDeathLine(victimId: string): string {
  const variants = [
    `<@${victimId}> is found near the smoldering remains of their home, the shock of returning to a burned-out shell written on their face.`,
    `By dawn, <@${victimId}>'s house is a blackened shell — and <@${victimId}> lies dead nearby, never having made it inside before the blaze consumed everything.`,
    `The village wakes to the smell of ash. <@${victimId}>'s home is gone, and so is <@${victimId}> — the fire claimed them when they came back to nothing but ruin.`,
  ];
  return pickRandom(variants);
}

export function arsonistIgniteLine(): string {
  const variants = [
    'In the dead of night, a dozen quiet flames become an inferno. Someone has set the village alight...',
    'The night erupts in fire as multiple houses go up in flames. An arsonist has finally struck.',
    'A chain of explosions and roaring flames tears through the village — all the doused houses ignite at once.',
  ];
  return pickRandom(variants);
}

export function alphaWolfTurnedYouLine(packMentions: string): string {
  const variants = [
    `Fangs tear into you — but instead of fading, your heartbeat roars louder. You rise with new hunger. You are now a **WEREWOLF**. Your pack: ${packMentions}.`,
    `You collapse beneath the Alpha's bite, certain it's the end. Then the darkness fills with snarls that feel like home. You are now part of the wolf pack. Your pack: ${packMentions}.`,
    `The Alpha's jaws close on you and the world goes red. When your vision clears, you are no villager anymore. You are a wolf. Your pack: ${packMentions}.`,
  ];
  return pickRandom(variants);
}

export function alphaWolfTurnedPackLine(newWolfId: string): string {
  const variants = [
    `You feel the Alpha's curse spread through the night. <@${newWolfId}> is no longer prey — they have joined your pack.`,
    `A new howl joins the chorus. The Alpha's bite has turned <@${newWolfId}> into one of you.`,
    `The pack grows. <@${newWolfId}> was bitten and is now a wolf. Welcome them to the hunt.`,
  ];
  return pickRandom(variants);
}

export function alphaWolfBiteChannelLine(): string {
  const variants = [
    "The Alpha Wolf's curse found a new host last night. Not everyone woke up the same.",
    "A dark blessing passed through the village. One who slept a villager rose a wolf.",
    "The Alpha Wolf's ancient curse took root. Someone has joined the pack.",
  ];
  return pickRandom(variants);
}

export function cultWinLine(): string {
  const variants = [
    'The village has been consumed from within. The cult wins!',
    'Every soul in the village now belongs to the cult. The cult wins!',
    'The cult has converted them all. There is no one left to resist. The cult wins!',
  ];
  return pickRandom(variants);
}

export function revealCultistsLine(mentions: string): string {
  return `The cultists were: ${mentions}.`;
}

export function cultGainedMemberLine(): string {
  const variants = [
    'In the dead of night, a whisper passed through the village. Someone has joined the cult.',
    "The cult's shadow grew longer overnight. A new voice now speaks their creed.",
    'A villager woke up changed. The cult has claimed another.',
  ];
  return pickRandom(variants);
}

export function cultBackfiredLine(victimId: string): string {
  const variants = [
    `The cult reached too far. Their newest member, <@${victimId}>, paid the price instead.`,
    `The Cult Hunter could not be taken. The cult's newest recruit, <@${victimId}>, died in the attempt.`,
    `The cult's ambition backfired. <@${victimId}>, their most recent convert, perished.`,
  ];
  return pickRandom(variants);
}

export function cultHunterKilledLine(victimId: string): string {
  const variants = [
    `<@${victimId}> was hunted down in the night — a cultist, eliminated.`,
    `The Cult Hunter struck true. <@${victimId}> has been removed from the cult's ranks.`,
    `<@${victimId}> was found bearing the mark of the cult and was swiftly eliminated.`,
  ];
  return pickRandom(variants);
}

export function cultConvertedDmLine(cultmateIds: string[]): string {
  const cultmates = cultmateIds.map((id) => `<@${id}>`).join(', ');
  return pickRandom([
    `You have been converted. You are now a **cultist**. Your fellow cultists: ${cultmates}.`,
    `A cultist visited you in the night. You are now one of them — a **cultist**. Your brothers and sisters: ${cultmates}.`,
    `Your old life is over. You are now a **cultist**. The cult: ${cultmates}.`,
  ]);
}

export function cultNewMemberNotifyDmLine(newMemberId: string): string {
  return pickRandom([
    `A new soul has joined the cause. <@${newMemberId}> is now one of us.`,
    `The cult grows. <@${newMemberId}> has been converted and stands with you.`,
    `Welcome <@${newMemberId}> to the fold. They are now a cultist.`,
  ]);
}

export function cultWolfImmuneDmLine(): string {
  return pickRandom([
    'Your target resisted the conversion. They are beyond your reach.',
    "The conversion failed — your target is immune to the cult's influence.",
    'Your chosen target could not be turned. Choose differently next time.',
  ]);
}

export function cultHunterNotCultistDmLine(): string {
  return pickRandom([
    'Your target bears no cult mark. They are not a cultist.',
    'You hunted carefully, but your target is not one of them.',
    'No cult mark found. Your target is innocent of the cult.',
  ]);
}

export function cultHunterCultistKilledDmLine(targetId: string): string {
  return pickRandom([
    `You found the mark. <@${targetId}> was a cultist — they will not convert another.`,
    `Your hunt was true. <@${targetId}> bore the cult's mark and has been eliminated.`,
    `<@${targetId}> was a cultist. They are gone now.`,
  ]);
}

export function cultHunterBackfireNotifyDmLine(): string {
  return pickRandom([
    'The cult came for you last night, but their newest member paid the price instead. Stay vigilant.',
    'You were targeted by the cult — but their own recruit died in your place.',
    "The cult's conversion attempt backfired. Their newest member is dead. You are safe.",
  ]);
}

export function thiefStoleLine(): string {
  const variants = [
    'Under cover of darkness, a thief crept through the village and stole someone\'s identity.',
    'A shadowy figure moved through the night, taking what was not theirs to take.',
    'Someone woke up this morning to find their role had been stolen in the night.',
  ];
  return pickRandom(variants);
}

export function thiefNewRoleDmLine(targetId: string, stolenRole: string): string {
  const variants = [
    `You slipped into <@${targetId}>'s home and stole their life. You are now a **${stolenRole}**.`,
    `Success. <@${targetId}> never knew you were there. Their role is yours now — you are a **${stolenRole}**.`,
    `You took everything from <@${targetId}>. You are now a **${stolenRole}**.`,
  ];
  return pickRandom(variants);
}

export function thiefTargetDmLine(): string {
  const variants = [
    'You wake to find something missing. A thief visited in the night and stole your role. You are now a plain **Villager**.',
    'Someone crept into your home last night and took your role. You are now a **Villager**.',
    'Your role was stolen while you slept. You are now a plain **Villager**.',
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
