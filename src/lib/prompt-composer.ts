// Shared between the server-rendered default (PromptComposer.astro) and the
// client-side live update (scripts/prompt-composer.ts), so the two can never
// disagree about how a prompt is worded.

export interface Option {
  value: string;
  label: string;
}

export interface PromptFields {
  subject: string;
  shotSize: string;
  camera: string;
  lightSource: string;
  lightDirection: string;
  lightHardness: string;
}

export const SHOT_SIZES: Option[] = [
  { value: "wide", label: "Wide" },
  { value: "medium", label: "Medium" },
  { value: "medium-close-up", label: "Medium close-up" },
  { value: "close-up", label: "Close-up" },
];

export const CAMERA_MOVES: Option[] = [
  { value: "static", label: "Static" },
  { value: "pan", label: "Pan" },
  { value: "push-in", label: "Push in" },
  { value: "handheld", label: "Handheld" },
];

export const LIGHT_SOURCES: Option[] = [
  { value: "window", label: "Window" },
  { value: "practical-lamp", label: "Practical lamp" },
  { value: "overcast-sky", label: "Overcast sky" },
  { value: "single-hard-lamp", label: "Single hard lamp" },
];

export const LIGHT_DIRECTIONS: Option[] = [
  { value: "front", label: "Front" },
  { value: "side", label: "Side" },
  { value: "back", label: "Back" },
];

export const LIGHT_HARDNESS: Option[] = [
  { value: "hard", label: "Hard" },
  { value: "soft", label: "Soft" },
];

export const DEFAULT_FIELDS: PromptFields = {
  subject: "A courier checks a delivery address on a phone",
  shotSize: "medium",
  camera: "static",
  lightSource: "window",
  lightDirection: "side",
  lightHardness: "soft",
};

const SHOT_SIZE_SENTENCE: Record<string, string> = {
  wide: "The shot is wide",
  medium: "The shot is medium",
  "medium-close-up": "The shot is a medium close-up",
  "close-up": "The shot is a close-up",
};

const CAMERA_SENTENCE: Record<string, string> = {
  static: "The camera is static",
  pan: "The camera pans",
  "push-in": "The camera pushes in",
  handheld: "The camera is handheld",
};

const LIGHT_SOURCE_PHRASE: Record<string, string> = {
  window: "a window",
  "practical-lamp": "a practical lamp",
  "overcast-sky": "an overcast sky",
  "single-hard-lamp": "a single hard lamp",
};

const LIGHT_DIRECTION_PHRASE: Record<string, string> = {
  front: "the front",
  side: "the side",
  back: "the back",
};

function asSentence(text: string): string {
  const trimmed = text.trim().replace(/[.!?]+$/, "");
  return trimmed ? `${trimmed}.` : "";
}

// Four sentences, in the lecture's own order: subject and action, shot size,
// camera movement, then light (source, direction, hardness) as one sentence.
export function composePrompt(fields: PromptFields): string {
  const subject = asSentence(fields.subject) || asSentence(DEFAULT_FIELDS.subject);
  const shotSentence = `${SHOT_SIZE_SENTENCE[fields.shotSize] ?? SHOT_SIZE_SENTENCE[DEFAULT_FIELDS.shotSize]}.`;
  const cameraSentence = `${CAMERA_SENTENCE[fields.camera] ?? CAMERA_SENTENCE[DEFAULT_FIELDS.camera]}.`;
  const lightSource =
    LIGHT_SOURCE_PHRASE[fields.lightSource] ?? LIGHT_SOURCE_PHRASE[DEFAULT_FIELDS.lightSource];
  const lightDirection =
    LIGHT_DIRECTION_PHRASE[fields.lightDirection] ?? LIGHT_DIRECTION_PHRASE[DEFAULT_FIELDS.lightDirection];
  const lightHardness = fields.lightHardness || DEFAULT_FIELDS.lightHardness;
  const lightSentence = `The light comes from ${lightSource}, from ${lightDirection}, and is ${lightHardness}.`;

  return [subject, shotSentence, cameraSentence, lightSentence].join(" ");
}
