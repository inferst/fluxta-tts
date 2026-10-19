import { ProviderError, type Provider, type Voice } from "./provider";

/**
 * A Provider's Voices, looked up once and kept. Asking the engine takes
 * ~80 ms on macOS, which every Phrase on the OS's voice would otherwise wait
 * for. An editor opening asks afresh, so a voice installed meanwhile shows
 * up there and is spoken with from then on.
 */
export class Voices {
  readonly #provider: Provider;
  #list?: Promise<Voice[]>;

  constructor(provider: Provider) {
    this.#provider = provider;
  }

  /** The Voices as last looked up, or looked up now. */
  list(): Promise<Voice[]> {
    return this.#list ?? this.refresh();
  }

  /** The Voices looked up afresh. A failed look-up is not kept. */
  refresh(): Promise<Voice[]> {
    const list = this.#provider.voices();
    this.#list = list;
    list.catch(() => {
      if (this.#list === list) {
        this.#list = undefined;
      }
    });
    return list;
  }

  /** The id of the voice the OS speaks with when none is chosen. */
  async osDefault(): Promise<string> {
    const voice = osDefaultOf(await this.list());
    if (!voice) {
      throw new ProviderError("voice-missing", "This computer has no voices");
    }
    return voice.id;
  }
}

/** The voice the Provider marks as the OS's own, else its first. */
export function osDefaultOf(voices: readonly Voice[]): Voice | undefined {
  return voices.find(({ isDefault }) => isDefault) ?? voices[0];
}
