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
  titleAr: string;
  emoji: string;
  tag: string;
  tagAr: string;
  /** Description slotted between PROMPT_PREFIX and PROMPT_SUFFIX. */
  description: string;
};

export function localizedProfessionTitle(
  profession: Profession,
  locale: "en" | "ar",
): string {
  return locale === "ar" ? profession.titleAr : profession.title;
}

export function localizedProfessionTag(
  profession: Profession,
  locale: "en" | "ar",
): string {
  return locale === "ar" ? profession.tagAr : profession.tag;
}

export function professionTitleById(
  id: string,
  locale: "en" | "ar",
  fallback?: string,
): string {
  const match = PROFESSIONS.find((p) => p.id === id);
  if (match) return localizedProfessionTitle(match, locale);
  if (fallback) {
    const byTitle = PROFESSIONS.find(
      (p) => p.title === fallback || p.titleAr === fallback,
    );
    if (byTitle) return localizedProfessionTitle(byTitle, locale);
    return fallback;
  }
  return id;
}

export const PROMPT_PREFIX =
  "Transform the person in the reference photo into a friendly, realistic portrait of the SAME person as ";

export const PROMPT_SUFFIX =
  ". Keep their face, skin tone, hair, age and identity clearly recognisable — it must obviously be the same person. Head-and-shoulders framing, bright cheerful studio lighting, warm smile, 3:4 portrait orientation, clean simple background.";

export const PROFESSIONS: Profession[] = [
  {
    id: "pilot",
    title: "Pilot",
    titleAr: "طيار",
    emoji: "✈️",
    tag: "Cleared for takeoff",
    tagAr: "جاهز للإقلاع",
    description:
      "a commercial airline pilot in a crisp navy-blue uniform jacket with four gold stripes on the epaulettes, a white collared shirt, dark tie, and a peaked pilot's cap with a gold emblem",
  },
  {
    id: "doctor",
    title: "Doctor",
    titleAr: "طبيب",
    emoji: "🩺",
    tag: "Here to help",
    tagAr: "هنا للمساعدة",
    description:
      "a doctor in a clean white medical coat over a shirt, a stethoscope around the neck, and a clipped hospital ID badge",
  },
  {
    id: "astronaut",
    title: "Astronaut",
    titleAr: "رائد فضاء",
    emoji: "🚀",
    tag: "Reaching the stars",
    tagAr: "نحو النجوم",
    description:
      "an astronaut in a white NASA-style spacesuit with colourful mission patches on the chest and shoulders and blue trim, holding the helmet under one arm",
  },
  {
    id: "firefighter",
    title: "Firefighter",
    titleAr: "رجل إطفاء",
    emoji: "🚒",
    tag: "Brave and ready",
    tagAr: "شجاع وجاهز",
    description:
      "a firefighter in full turnout gear — a heavy yellow-and-tan protective jacket with silver reflective stripes — and a bright red fire helmet",
  },
  {
    id: "police",
    title: "Police Officer",
    titleAr: "شرطي",
    emoji: "👮",
    tag: "Keeping us safe",
    tagAr: "نحميكم",
    description:
      "a police officer in a smart dark-blue police uniform shirt with a silver badge on the chest, shoulder insignia, and a peaked police cap",
  },
  {
    id: "chef",
    title: "Chef",
    titleAr: "طاهٍ",
    emoji: "👩‍🍳",
    tag: "Cooking up magic",
    tagAr: "نطبخ السحر",
    description:
      "a chef in a white double-breasted chef's jacket and a tall white chef's hat, with a softly blurred kitchen behind",
  },
  {
    id: "racer",
    title: "Racing Driver",
    titleAr: "سائق سباق",
    emoji: "🏎️",
    tag: "Fast and fearless",
    tagAr: "سريع وجريء",
    description:
      "a race car driver in a colourful motorsport racing suit covered in sponsor patches, holding a racing helmet under one arm",
  },
  {
    id: "footballer",
    title: "Footballer",
    titleAr: "لاعب كرة قدم",
    emoji: "⚽",
    tag: "Going for goal",
    tagAr: "نحو الهدف",
    description:
      "a professional football player in a bright team jersey, shorts and shin guards, standing on a green stadium pitch",
  },
  {
    id: "scientist",
    title: "Scientist",
    titleAr: "عالم",
    emoji: "🔬",
    tag: "Curious mind",
    tagAr: "عقل فضولي",
    description:
      "a scientist in a white lab coat with clear safety goggles pushed up on the forehead, holding up a test tube in a bright laboratory",
  },
  {
    id: "vet",
    title: "Vet",
    titleAr: "طبيب بيطري",
    emoji: "🐾",
    tag: "Animal friend",
    tagAr: "صديق الحيوانات",
    description:
      "a veterinarian in green medical scrubs with a stethoscope, gently holding a small puppy",
  },
  {
    id: "engineer",
    title: "Engineer",
    titleAr: "مهندس",
    emoji: "🦺",
    tag: "Builder of things",
    tagAr: "بنّاء الأشياء",
    description:
      "a construction engineer in a hi-vis orange safety vest over a shirt and a white hard hat, holding rolled-up blueprints",
  },
  {
    id: "artist",
    title: "Artist",
    titleAr: "فنان",
    emoji: "🎨",
    tag: "Full of colour",
    tagAr: "مليء بالألوان",
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
