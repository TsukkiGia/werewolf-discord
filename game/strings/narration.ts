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
    `The Day ${dayNumber} vote ends with no majority. No one is lynched.`,
    `The Day ${dayNumber} vote is over. No one receives enough votes to be lynched.`,
    `The Day ${dayNumber} vote ends in a stalemate. No one is lynched.`,
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
    'Rumor spreads that someone should have died in the night, but a doctor stepped in and pulled them back from the brink.',
    'The villagers hear that a killer was stopped at the last moment — the doctor protected their target.',
    'People whisper that someone should be dead, but the doctor saved them.',
  ];
  return pickRandom(variants);
}

export function inspectedTargetDmLine(): string {
  const variants = [
    'You sleep is broken by the feeling of unseen eyes on you. Someone probed at your secrets in the night.',
    'You wake with the sense that you were being watched — not by wolves, but by something searching for the truth about you.',
    'Your dreams were full of staring eyes and whispered questions. It feels like someone tried to read who you really are.',
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

export function doctorQuietWatchTargetLine(): string {
  const variants = [
    'You slept lightly, never quite sure why — as if someone was standing guard over you in the dark.',
    'The night felt strangely still around your home. In the morning you can’t shake the sense that someone watched over you.',
    'Nothing attacked you last night, but you woke with the calm certainty that a careful pair of eyes had been keeping watch.',
  ];
  return pickRandom(variants);
}

export function hunterTriggerLine(): string {
  const variants = [
    'The Hunter stumbles, but something fierce lights up behind their eyes.',
    'The Hunter falls, yet even as they hit the ground their gaze hardens with one last purpose.',
    'Wounds bloom across the Hunter’s body, but their grip tightens on their weapon. This isn’t over yet.',
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

export function serialKillerWinLine(): string {
  const variants = [
    'When the screams finally stop, only the Serial Killer remains. Everyone else is dead — the Serial Killer wins alone.',
    'The village is quiet now, its factions shattered. One figure walks away from the ruin: the Serial Killer. They win.',
    'All wolves, villagers, and zealots are gone. Only the Serial Killer is left standing. Their bloody work is complete — they win.',
    'In the end there were only two left; now one body cools on the ground, and the Serial Killer wipes the blade clean. Everyone else has been slaughtered.',
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
    `<@${victim.user_id}> was killed by the wolves during the night. They were ${summary}.`,
    `By morning, <@${victim.user_id}> is found dead with clear signs of a wolf attack. They were ${summary}.`,
    `<@${victim.user_id}> did not survive the night — the wolves claimed them. They were ${summary}.`,
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

export function harlotFatalVisitOnYouLine(): string {
  const variants = [
    'In the dark, someone slipped into your home — and never left it alive. By dawn, you know a visitor died because they chose your door.',
    'You remember company in the night, then chaos. When morning comes, word spreads that the one who visited you never saw the sunrise.',
    'Someone shared your night, and the village whispers that it was their last. Whatever truly killed them, they died after coming to you.',
  ];
  return pickRandom(variants);
}

export function harlotFatalVisitOnYourHouseLine(): string {
  const variants = [
    'You had a visitor last night — and then the wolves crashed in. By sunrise, you hear that the one who chose your house died in the attack.',
    'There was someone else in your home when the claws came out. Morning gossip confirms it: your midnight visitor did not survive.',
    'You weren’t alone when the wolves struck. The village now speaks in hushed tones about the stranger who died after sharing your roof.',
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

export function serialKillerKillDmLine(targetId: string): string {
  const variants = [
    `You stalked <@${targetId}> through the dark and struck when no one was watching. Another body hits the ground.`,
    `You followed <@${targetId}> like a shadow until the perfect moment. One quick, practiced blow — they will not see dawn.`,
    `You drifted behind <@${targetId}> all night, waiting. When the village slept deepest, your knife found its mark.`,
  ];
  return pickRandom(variants);
}

export function serialKillerVictimDmLine(): string {
  const variants = [
    'You never heard footsteps behind you — only the sudden pain of steel in the dark. A lone killer ended your story tonight.',
    'Something moved just outside your vision, then cold metal slid between your ribs. You died to a silent killer in the night.',
    'There was no howl, no shouting mob — only a shadow and a flash of a blade. The Serial Killer claimed you in the dark.',
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

export function serialKillerVictimDeathLine(victimId: string): string {
  const variants = [
    `<@${victimId}> is found in a quiet corner, the ground dark with blood and no wolf tracks in sight — the Serial Killer struck in the dark.`,
    `At dawn, the village discovers <@${victimId}>'s body hidden away from the main paths, the wounds too clean for wolves. Everyone whispers about the Serial Killer.`,
    `There are no signs of fire or fangs around <@${victimId}>'s corpse, only careful stab wounds. It looks like the Serial Killer has been at work.`,
  ];
  return pickRandom(variants);
}

export function skFoughtBackDmLine(): string {
  const variants = [
    'The wolves came for you in the night. They chose the wrong target — one of them is dead, and you are still breathing.',
    'Something moved in the shadows outside your door. You were ready. One wolf came close enough to touch, and that was their mistake.',
    "You heard them coming before they reached you. By the time it was over, you'd left one wolf bleeding in the dark.",
  ];
  return pickRandom(variants);
}

export function skCounterKillWolfDmLine(wolfId: string): string {
  const variants = [
    `Your pack moved on the Serial Killer tonight. It was a mistake — <@${wolfId}> didn't make it back.`,
    `You hunted the Serial Killer as a pack. The killer was ready. <@${wolfId}> paid for it with their life.`,
    `The Serial Killer turned the hunt around on you. <@${wolfId}> is dead. Choose your targets more carefully.`,
  ];
  return pickRandom(variants);
}

export function loverSorrowDeathLine(victimId: string, partnerId: string | undefined): string {
  const partnerMention = partnerId ? `<@${partnerId}>` : 'their lost lover';
  const variants = [
    `<@${victimId}> could not bear life without ${partnerMention}. They died of a broken heart.`,
    `Grief proves fatal: after ${partnerMention} fell, <@${victimId}> slipped away in sorrow.`,
    `Before dawn, the village finds <@${victimId}> clutching ${partnerMention}'s lifeless body, their wail spent and their heart finally broken — they have died of heartbreak.`,
  ];
  return pickRandom(variants);
}

export function loverSorrowDeathDmLine(partnerId: string | undefined): string {
  const partnerMention = partnerId ? `<@${partnerId}>` : 'your lost lover';
  const variants = [
    `You cannot bear life without ${partnerMention}. Your heart breaks, and you die in sorrow.`,
    `Grief proves fatal. After ${partnerMention} falls, you feel something inside you give way — you slip away in heartbreak.`,
    `You cling to ${partnerMention}'s lifeless body until your own heart finally gives out. You have died of heartbreak.`,
  ];
  return pickRandom(variants);
}

export function arsonistFireHomeDeathLine(victimId: string): string {
  const variants = [
    `One of the burning houses was <@${victimId}>'s. They never made it out of the flames.`,
    `Amid the fires, <@${victimId}>'s home collapses in embers — their body is recovered from the ash.`,
    `<@${victimId}> is counted among the victims found in the charred ruins of their own home.`,
  ];
  return pickRandom(variants);
}

export function arsonistFireAwayDeathLine(victimId: string): string {
  const variants = [
    `In the chaos around the burning houses, <@${victimId}> is found near the ruins of their home — another victim of the blaze.`,
    `By dawn, <@${victimId}>'s house is a blackened shell, and <@${victimId}> lies dead nearby, claimed by the same inferno.`,
    `The village wakes to smoke and soot. <@${victimId}> is discovered near the ashes of their home — one more life taken by the fires.`,
  ];
  return pickRandom(variants);
}

export function wolfStabbedBySerialKillerLine(wolfId: string): string {
  const variants = [
    `One of the wolves did not return from the hunt. <@${wolfId}> is found torn open by **knives**, not claws — the Serial Killer fought back.`,
    `The pack’s ranks are thinner this morning. <@${wolfId}>'s body bears deep stab wounds — whoever they hunted turned out to be the Serial Killer.`,
    `Rumor spreads that a wolf died in the night, not by fire or villagers, but by cold, precise stab wounds. <@${wolfId}> crossed paths with the Serial Killer and will howl no more.`,
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
    'The village has been hollowed out from within. Every whispered vow now belongs to the cult — the cult wins.',
    'No banners are raised, no trumpets sound. One by one, every mind has bent the knee. The cult wins.',
    'By the time the village understands what happened, it is already too late. Every soul answers to the same creed. The cult wins.',
  ];
  return pickRandom(variants);
}

export function revealCultistsLine(mentions: string): string {
  return `In the end, the cultists lurking in the shadows were: ${mentions}.`;
}

export function cultGainedMemberLine(): string {
  const variants = [
    'In the dead of night, a whisper coils through the village. Someone has answered and joined the cult.',
    "The cult's shadow stretches longer by morning. A once-ordinary villager now murmurs their secret creed.",
    'A villager wakes with new eyes and a new allegiance. Quietly, the cult has claimed another soul.',
  ];
  return pickRandom(variants);
}

export function cultBackfiredLine(victimId: string): string {
  const variants = [
    `The cult reached too far. Their newest member, <@${victimId}>, became the sacrifice instead of the prize.`,
    `The Cult Hunter would not bow. The cult's latest recruit, <@${victimId}>, died in the doomed attempt.`,
    `Ambition curdled into disaster. The cult's most recent convert, <@${victimId}>, perished when the ritual turned on them.`,
  ];
  return pickRandom(variants);
}

export function cultBackfireMonsterLine(victimId: string): string {
  const variants = [
    `The cult reached for something monstrous in the dark. By dawn, only <@${victimId}>'s broken body remained.`,
    `Whispers say a cultist tried to bind a creature beyond their control. <@${victimId}> paid for that arrogance with their life.`,
    `The ritual latched onto a nightmare instead of a willing soul. Whatever answered tore <@${victimId}> apart.`,
  ];
  return pickRandom(variants);
}

export function cultHunterKilledLine(victimId: string): string {
  const variants = [
    `<@${victimId}> was hunted down in the night — a marked cultist, cut from the circle.`,
    `The Cult Hunter struck true. <@${victimId}> was torn from the cult's ranks before they could convert another.`,
    `<@${victimId}> was found bearing the cult's hidden mark and was swiftly eliminated.`,
  ];
  return pickRandom(variants);
}

export function cultConvertedDmLine(cultmateIds: string[]): string {
  const cultmates = cultmateIds.map((id) => `<@${id}>`).join(', ');
  return pickRandom([
    `Something took hold of you in the dark. You have been converted — you are now a **cultist**. Your fellow cultists: ${cultmates}.`,
    `A hooded figure visited you in the night and whispered a new truth. You are now one of them — a **cultist**. Your brothers and sisters: ${cultmates}.`,
    `Your old loyalties feel distant and dull. You are now a **cultist**. The cult that owns your soul: ${cultmates}.`,
  ]);
}

export function cultNewMemberNotifyDmLine(newMemberId: string): string {
  return pickRandom([
    `A new soul has joined the circle. <@${newMemberId}> is now one of us.`,
    `The cult grows in the dark. <@${newMemberId}> has been converted and now stands beside you.`,
    `Another mind has bent the knee. Welcome <@${newMemberId}> to the fold — they are now a cultist.`,
  ]);
}

export function cultWolfImmuneDmLine(): string {
  return pickRandom([
    'You pressed your will against theirs — and it broke on something older and stronger. Your target resisted the conversion.',
    "The ritual fizzled out around them. This one is immune to the cult's influence.",
    'Your chosen target will not kneel. They cannot be turned. Choose differently next time.',
  ]);
}

export function cultImmuneTargetDmLine(victimId: string): string {
  return pickRandom([
    `Something clawed at the edges of your mind in the night — then snapped back on its caster. <@${victimId}> of the cult is dead, and you remain unchanged.`,
    `A ritual tried to wrap itself around your soul and failed. Somewhere in the dark, <@${victimId}> of the cult paid for the attempt with their life.`,
    `The cult reached for your allegiance and found only resistance. Their power could not touch you — <@${victimId}> died instead.`,
  ]);
}

export function cultHunterMissTargetDmLine(): string {
  return pickRandom([
    'You felt a prickle on your skin last night, as if someone was hunting for a cult mark that wasn’t there.',
    'Something searched you in the dark and found nothing. Whoever was hunting cultists did not claim you.',
    'A wary gaze brushed past your soul, looking for the cult’s stain. They moved on — you were not what they sought.',
  ]);
}

export function cultHunterKilledTargetDmLine(): string {
  return pickRandom([
    'You feel a presence close in on you, cold and certain. There is no bargaining — you are marked as cult and cut down.',
    'A hunter’s judgment falls on you in the night. They see the cult’s mark and end your story there.',
    'Someone who knows the cult’s signs found them on you. Their sentence is swift, and you do not see the dawn.',
  ]);
}

export function cultHunterNotCultistDmLine(): string {
  return pickRandom([
    'You search for the hidden mark and find nothing. Your target is not a cultist.',
    'You hunted carefully through the shadows, but this one is not part of the cult.',
    'No sigil, no whisper, no trace. Your target is innocent of the cult — for now.',
  ]);
}

export function cultHunterCultistKilledDmLine(targetId: string): string {
  return pickRandom([
    `You found the mark burning beneath the surface. <@${targetId}> was a cultist — they will not convert another.`,
    `Your hunt was true. <@${targetId}> bore the cult's secret sigil and has been eliminated.`,
    `<@${targetId}> was a cultist, rooted out and removed from the circle. They are gone now.`,
  ]);
}

export function cultHunterBackfireNotifyDmLine(): string {
  return pickRandom([
    'The cult came for you last night, but their newest member died screaming in your place. For now, you live.',
    'You felt a hand reaching for your soul — then heard a different voice fall silent. The cult lost one of their own trying to claim you.',
    "The cult's conversion attempt backfired. Their newest recruit was sacrificed instead of you. You are safe — this time.",
  ]);
}

export function cultBackfireVictimDmLine(targetId: string): string {
  return pickRandom([
    `You reached out to drag <@${targetId}> into the cult — but they were far from helpless. They turned on you, and you never made it back from the attempt.`,
    `Your whispered rites failed. <@${targetId}> broke free and tore you apart instead of joining your cause. Your blood seals the broken ritual.`,
    `The moment you tried to claim <@${targetId}> for the cult, everything went wrong: teeth, steel, panic — and then darkness.`,
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

// --- Tanner ---

export function tannerLynchLines(): string[] {
  return [
    'In a cruel twist, the village has hanged the Tanner — a miserable soul who wanted nothing more than to die.',
    'The Tanner wins alone. Everyone else loses.',
  ];
}

// --- Doctor DMs ---

export function doctorWolfProtectionKilledDmLine(targetId: string): string {
  return pickRandom([
    `You tried to protect <@${targetId}>, but they were a wolf in disguise. They turned on you — you did not survive.`,
    `Your healing hands reached for <@${targetId}>, but you found a wolf instead. They tore into you, and you paid with your life.`,
    `<@${targetId}> was no innocent to protect — they were a wolf. You learned that too late.`,
  ]);
}

export function doctorWolfProtectionSurvivedDmLine(targetId: string): string {
  return pickRandom([
    `You tried to protect <@${targetId}>, but they were a wolf in disguise. They lunged for you, but you escaped with your life.`,
    `<@${targetId}> was a wolf, not a patient. They snapped at you — but you barely managed to pull away.`,
    `You reached to protect <@${targetId}> and found fangs instead. You survived, but only just.`,
  ]);
}

export function doctorProtectionResultDmLine(isSelf: boolean, saved: boolean, targetId: string): string {
  if (isSelf) {
    return saved
      ? 'You guarded yourself tonight. The wolves came for you, but your defenses held.'
      : 'You guarded yourself tonight. The wolves never came.';
  }
  return saved
    ? `You watched over <@${targetId}>. The wolves struck, but your protection held.`
    : `You watched over <@${targetId}>. The night passed quietly.`;
}

// --- Chemist DMs ---

export function chemistAwayTargetDmLine(targetId: string): string {
  return pickRandom([
    `You went looking for <@${targetId}> to share your potions, but they were out for the night. Your vials stayed corked.`,
    `<@${targetId}> wasn't home. You couldn't run your experiment tonight.`,
    `You waited at <@${targetId}>'s door with your vials ready, but they never came back. The duel is off.`,
  ]);
}

export function chemistDiedFromDuelDmLine(targetId: string): string {
  return pickRandom([
    `You visited <@${targetId}> to share your potions. They grabbed the safe one. You drank the poison and died.`,
    `You brought two vials to <@${targetId}>'s door. They chose wisely. You didn't.`,
    `<@${targetId}> saw through your trick — or simply got lucky. The wrong potion was yours.`,
  ]);
}

export function chemistWonDuelDmLine(targetId: string): string {
  return pickRandom([
    `You visited <@${targetId}> to share your potions. They chose poorly and drank the poison. You survived.`,
    `<@${targetId}> made the wrong choice. The poison was theirs, and you walk away.`,
    `Two vials, one right and one wrong. <@${targetId}> picked the fatal one.`,
  ]);
}

export function chemistTargetSurvivedDmLine(): string {
  return pickRandom([
    "The Chemist dragged you into a midnight tasting. At the last moment you grabbed the safe vial — they swallowed the poison and never saw the sunrise.",
    'You faced the Chemist\'s two vials in the dark. Somehow you chose right. They didn\'t.',
    'The Chemist forced a choice on you and lost their own gamble. You live.',
  ]);
}

export function chemistTargetDiedFromDuelDmLine(): string {
  return pickRandom([
    'The Chemist visited you for a late-night drink. You chose the wrong potion and died from the poison.',
    'Two vials, one lethal. The Chemist offered both — and the one you reached for was poison.',
    'A midnight visitor with potions in hand. The one you chose was poison.',
  ]);
}

// --- Arsonist DMs ---

export function arsonistDousedTargetDmLine(targetId: string): string {
  return pickRandom([
    `You quietly drenched <@${targetId}>'s house in kerosene. It will stay primed until you choose to ignite.`,
    `<@${targetId}>'s home is now coated in fuel, ready for your signal.`,
    `You marked <@${targetId}>'s house for fire. When you ignite, it will burn.`,
  ]);
}

export function arsonistDousedTargetVictimDmLine(): string {
  return pickRandom([
    'The air in your home smells faintly of oil and smoke, though you never lit a fire. Something about your house feels primed for disaster.',
    'You wake with the uneasy sense that your walls are slick with danger, as if someone quietly prepared your home to burn.',
    'Nothing attacked you last night, but the faint scent of fuel clings to your doorframe. It feels like someone has marked your house for flames.',
  ]);
}

// --- Serial Killer DMs ---

export function skBlockedByDoctorDmLine(): string {
  return pickRandom([
    'You struck from the shadows, but someone was already guarding your target. Your kill was stopped by a doctor.',
    'Your blade found nothing — a doctor stepped in and pulled your target out of reach.',
    'You came for blood, but a healer was already there. The doctor blocked your kill.',
  ]);
}

export function wolfStabbedBySKDmLine(): string {
  return pickRandom([
    'You lunged for your prey, but steel flashed in the dark. A knife found you before your fangs could.',
    'You came for blood and found a blade instead. The Serial Killer was ready for you.',
    'Your prey turned hunter. Before your fangs could close, cold steel found its mark.',
  ]);
}

export function traitorAwakenedYouLine(packMentions: string): string {
  const variants = [
    `The howls you once feared now feel like home. You wake with new hunger — you have awakened as a **WEREWOLF**. Your pack: ${packMentions}.`,
    'Something inside you finally snaps into place. The village was never truly yours. You are now a **WEREWOLF**, called to stand with the remaining wolves.',
    `Your old loyalties crumble before the pull of the hunt. You awaken as a **WEREWOLF**. Your pack: ${packMentions}.`,
  ];
  return pickRandom(variants);
}

export function traitorAwakenedPackLine(traitorId: string): string {
  const variants = [
    `A familiar face turns toward the moon. <@${traitorId}> has awakened as one of your pack.`,
    `You feel the pack’s presence swell. The Traitor, <@${traitorId}>, now howls with you.`,
    `Another heart beats in time with the hunt. <@${traitorId}> has joined you as a wolf.`,
  ];
  return pickRandom(variants);
}
