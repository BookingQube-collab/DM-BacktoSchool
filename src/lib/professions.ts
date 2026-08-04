export type ProfessionId =
  | "pilot"
  | "doctor"
  | "astronaut"
  | "firefighter"
  | "police"
  | "chef"
  | "racer"
  | "footballer"
  | "scientist"
  | "vet"
  | "engineer"
  | "artist";

export type Profession = {
  id: ProfessionId;
  title: string;
  emoji: string;
  tag: string;
  /** Description slotted between PROMPT_PREFIX and PROMPT_SUFFIX. */
  description: string;
};

export const PROMPT_PREFIX =
  "Transform the person in the reference photo into a friendly, realistic portrait of the SAME person as ";

export const PROMPT_SUFFIX =
  ". Keep their face, skin tone, hair, age and identity clearly recognisable — it must obviously be the same person. Head-and-shoulders framing, bright cheerful studio lighting, warm smile, 3:4 portrait orientation, clean simple background.";

export const PROFESSIONS: Profession[] = [
  {
    id: "pilot",
    title: "Pilot",
    emoji: "✈️",
    tag: "Cleared for takeoff",
    description:
      "a commercial airline pilot in a crisp navy-blue uniform jacket with four gold stripes on the epaulettes, a white collared shirt, dark tie, and a peaked pilot's cap with a gold emblem",
  },
  {
    id: "doctor",
    title: "Doctor",
    emoji: "🩺",
    tag: "Here to help",
    description:
      "a doctor in a clean white medical coat over a shirt, a stethoscope around the neck, and a clipped hospital ID badge",
  },
  {
    id: "astronaut",
    title: "Astronaut",
    emoji: "🚀",
    tag: "Reaching the stars",
    description:
      "an astronaut in a white NASA-style spacesuit with colourful mission patches on the chest and shoulders and blue trim, holding the helmet under one arm",
  },
  {
    id: "firefighter",
    title: "Firefighter",
    emoji: "🚒",
    tag: "Brave and ready",
    description:
      "a firefighter in full turnout gear — a heavy yellow-and-tan protective jacket with silver reflective stripes — and a bright red fire helmet",
  },
  {
    id: "police",
    title: "Police Officer",
    emoji: "👮",
    tag: "Keeping us safe",
    description:
      "a police officer in a smart dark-blue police uniform shirt with a silver badge on the chest, shoulder insignia, and a peaked police cap",
  },
  {
    id: "chef",
    title: "Chef",
    emoji: "👩‍🍳",
    tag: "Cooking up magic",
    description:
      "a chef in a white double-breasted chef's jacket and a tall white chef's hat, with a softly blurred kitchen behind",
  },
  {
    id: "racer",
    title: "Racing Driver",
    emoji: "🏎️",
    tag: "Fast and fearless",
    description:
      "a race car driver in a colourful motorsport racing suit covered in sponsor patches, holding a racing helmet under one arm",
  },
  {
    id: "footballer",
    title: "Footballer",
    emoji: "⚽",
    tag: "Going for goal",
    description:
      "a professional football player in a bright team jersey, shorts and shin guards, standing on a green stadium pitch",
  },
  {
    id: "scientist",
    title: "Scientist",
    emoji: "🔬",
    tag: "Curious mind",
    description:
      "a scientist in a white lab coat with clear safety goggles pushed up on the forehead, holding up a test tube in a bright laboratory",
  },
  {
    id: "vet",
    title: "Vet",
    emoji: "🐾",
    tag: "Animal friend",
    description:
      "a veterinarian in green medical scrubs with a stethoscope, gently holding a small puppy",
  },
  {
    id: "engineer",
    title: "Engineer",
    emoji: "🦺",
    tag: "Builder of things",
    description:
      "a construction engineer in a hi-vis orange safety vest over a shirt and a white hard hat, holding rolled-up blueprints",
  },
  {
    id: "artist",
    title: "Artist",
    emoji: "🎨",
    tag: "Full of colour",
    description:
      "an artist in a paint-splattered apron holding a wooden paint palette and brush, in a colourful art studio",
  },
];

/**
 * Build the image prompt for a specific profession, per-request.
 * Never call this at module load — always call it with the tapped profession
 * at the moment we're about to hit the edge function.
 */
export function buildPromptForProfession(profession: Profession): string {
  return `${PROMPT_PREFIX}${profession.description}${PROMPT_SUFFIX}`;
}
