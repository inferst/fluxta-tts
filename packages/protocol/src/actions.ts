/**
 * Speak's settings. `text` is what the Phrase says; it may hold `{{…}}`
 * references, and Fluxta interpolates it before the sidecar sees it — a lone
 * reference keeps its value's type, so what arrives can be a number or a
 * boolean as well as text.
 */
export type SpeakSettings = {
  text?: string;
};
