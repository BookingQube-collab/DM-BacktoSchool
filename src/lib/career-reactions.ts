import type { Profession, ProfessionId } from "@/lib/professions";

export type CareerReactionEffect =
  | "plane"
  | "heartbeat"
  | "launch"
  | "rescue"
  | "siren"
  | "kitchen"
  | "speed"
  | "goal"
  | "discovery"
  | "paws"
  | "gears"
  | "paint";

export type CareerReactionConfig = {
  id: ProfessionId;
  text: string;
  effect: CareerReactionEffect;
  /** Extra emoji accents layered behind / around the main character */
  accents: string[];
};

export const CAREER_REACTION_DURATION_MS = 4000;
export const CAREER_REACTION_REDUCED_MS = 1600;

export const CAREER_REACTIONS: Record<ProfessionId, CareerReactionConfig> = {
  pilot: {
    id: "pilot",
    text: "READY FOR TAKEOFF!",
    effect: "plane",
    accents: ["☁️", "☁️", "💨"],
  },
  doctor: {
    id: "doctor",
    text: "HEARTBEAT OF A HERO!",
    effect: "heartbeat",
    accents: ["❤️", "💉"],
  },
  astronaut: {
    id: "astronaut",
    text: "BLAST OFF!",
    effect: "launch",
    accents: ["⭐", "✨", "🌙"],
  },
  firefighter: {
    id: "firefighter",
    text: "MISSION: RESCUE!",
    effect: "rescue",
    accents: ["🔥", "💧", "🚨"],
  },
  police: {
    id: "police",
    text: "READY TO PROTECT!",
    effect: "siren",
    accents: ["🚨", "🔦"],
  },
  chef: {
    id: "chef",
    text: "COOKING UP A DREAM!",
    effect: "kitchen",
    accents: ["🍳", "🥄", "💨"],
  },
  racer: {
    id: "racer",
    text: "FULL SPEED AHEAD!",
    effect: "speed",
    accents: ["🏁", "💨"],
  },
  footballer: {
    id: "footballer",
    text: "GOOOAAAL!",
    effect: "goal",
    accents: ["🥅", "🎉", "✨"],
  },
  scientist: {
    id: "scientist",
    text: "DISCOVERY MODE ON!",
    effect: "discovery",
    accents: ["🧪", "💡", "✨"],
  },
  vet: {
    id: "vet",
    text: "ANIMAL HERO!",
    effect: "paws",
    accents: ["🐶", "🐱", "🦴"],
  },
  engineer: {
    id: "engineer",
    text: "BUILD THE FUTURE!",
    effect: "gears",
    accents: ["⚙️", "🔧", "✨"],
  },
  artist: {
    id: "artist",
    text: "CREATE SOMETHING AMAZING!",
    effect: "paint",
    accents: ["🖌️", "🌈", "✨"],
  },
};

export function getCareerReaction(
  profession: Profession | ProfessionId,
): CareerReactionConfig {
  const id = typeof profession === "string" ? profession : profession.id;
  return CAREER_REACTIONS[id] ?? CAREER_REACTIONS.artist;
}
