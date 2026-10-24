import { ProviderError, type Voice } from "../speech/provider";

const API = "https://api.elevenlabs.io";

/** How long a request may take before it is given up as `transient`. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** The most voices ElevenLabs gives in one page. */
const PAGE_SIZE = 100;

/**
 * What one call to ElevenLabs says of the account: it works; it does not —
 * the key, a permission, the credits, or no way through to ElevenLabs; or
 * nothing — a rate limit, a missing voice, a text it refuses, its own fault.
 */
export type Outcome =
  { connected: true } | { connected: false; reason: string } | undefined;

export type ElevenLabsClientOptions = {
  /** The API key as stored now; `undefined` when there is none. */
  key: () => string | undefined;
  /**
   * Told after every call, with the key it was made with: a key replaced
   * meanwhile makes its outcome stale.
   */
  onOutcome?: (outcome: Outcome, key: string) => void;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

/**
 * The ElevenLabs API, as the plugin uses it. Every request carries the API
 * key in `xi-api-key` and gives up after {@link REQUEST_TIMEOUT_MS}; every
 * failure is a ProviderError whose reason is ElevenLabs' own message, or
 * what went wrong on the way. The key never reaches a reason: neither
 * ElevenLabs' answers nor `fetch`'s errors hold the request's headers.
 */
export class ElevenLabsClient {
  readonly #key: () => string | undefined;
  readonly #onOutcome: (outcome: Outcome, key: string) => void;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;

  constructor({
    key,
    onOutcome = () => {},
    fetch = globalThis.fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
  }: ElevenLabsClientOptions) {
    this.#key = key;
    this.#onOutcome = onOutcome;
    this.#fetch = fetch;
    this.#timeoutMs = timeoutMs;
  }

  /** Every voice in the account's My Voices, page after page. */
  async voices(signal?: AbortSignal): Promise<Voice[]> {
    const voices: Voice[] = [];
    let token: string | undefined;
    do {
      const query = new URLSearchParams({
        page_size: String(PAGE_SIZE),
        include_total_count: "false",
        ...(token !== undefined && { next_page_token: token }),
      });
      const page = await this.#json(`/v2/voices?${query}`, signal);
      voices.push(...voicesOf(page));
      token =
        isRecord(page) &&
        page.has_more === true &&
        typeof page.next_page_token === "string" &&
        page.next_page_token !== ""
          ? page.next_page_token
          : undefined;
    } while (token !== undefined);
    return voices;
  }

  /** One GET, its JSON body; whatever fails is a ProviderError. */
  async #json(path: string, signal?: AbortSignal): Promise<unknown> {
    const key = this.#key();
    if (key === undefined) {
      throw new ProviderError(
        "unavailable",
        "There is no ElevenLabs API key — add one under ElevenLabs",
      );
    }
    const timeout = AbortSignal.timeout(this.#timeoutMs);
    let response: Response;
    let body: unknown;
    try {
      response = await this.#fetch(`${API}${path}`, {
        headers: { "xi-api-key": key, accept: "application/json" },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      // Read whole within the timeout: a body cut short is no answer.
      body = parsed(await response.text());
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason;
      }
      const failure = timeout.aborted
        ? new ProviderError(
            "transient",
            `ElevenLabs did not answer within ${this.#timeoutMs / 1000} s`,
          )
        : new ProviderError(
            "transient",
            `Cannot reach ElevenLabs: ${error instanceof Error ? error.message : String(error)}`,
          );
      this.#onOutcome({ connected: false, reason: failure.message }, key);
      throw failure;
    }
    if (response.ok) {
      this.#onOutcome({ connected: true }, key);
      return body;
    }
    const failure = errorOf(response.status, body);
    this.#onOutcome(
      failure.kind === "unavailable"
        ? { connected: false, reason: failure.message }
        : undefined,
      key,
    );
    throw failure;
  }
}

/**
 * An ElevenLabs answer that is not a success, as a ProviderError: the key,
 * a permission or the credits are `unavailable`; a rate limit or
 * ElevenLabs' own failure `transient`; a voice it does not have
 * `voice-missing`; anything else it refuses `rejected`.
 */
function errorOf(status: number, body: unknown): ProviderError {
  const reason = `ElevenLabs: ${messageOf(body) ?? `it answered ${status}`}`;
  if (status === 401 || status === 402 || status === 403) {
    return new ProviderError("unavailable", reason);
  }
  if (status === 429 || status >= 500) {
    return new ProviderError("transient", reason);
  }
  if (status === 404) {
    return new ProviderError("voice-missing", reason);
  }
  return new ProviderError("rejected", reason);
}

/**
 * ElevenLabs' message: `detail.message` in its documented shape, the first
 * `detail[].msg` of a validation error, or a bare `detail` string.
 */
function messageOf(body: unknown): string | undefined {
  const detail = isRecord(body) ? body.detail : undefined;
  const message = Array.isArray(detail)
    ? (detail.find(isRecord)?.msg ?? undefined)
    : isRecord(detail)
      ? detail.message
      : detail;
  return typeof message === "string" && message.trim() !== ""
    ? message.trim()
    : undefined;
}

/**
 * The voices of one page, by the name the site shows. They speak whatever
 * language their text is in, so none has a language of its own.
 */
function voicesOf(page: unknown): Voice[] {
  const voices =
    isRecord(page) && Array.isArray(page.voices) ? page.voices : [];
  return voices.flatMap((voice): Voice[] => {
    if (
      !isRecord(voice) ||
      typeof voice.voice_id !== "string" ||
      voice.voice_id === ""
    ) {
      return [];
    }
    const name =
      typeof voice.name === "string" && voice.name.trim() !== ""
        ? voice.name.trim()
        : voice.voice_id;
    return [{ id: voice.voice_id, name }];
  });
}

/** A body as JSON, or nothing when it is not JSON. */
function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
