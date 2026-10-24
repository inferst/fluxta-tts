import { describe, expect, it, vi } from "vitest";

import { ProviderError } from "../speech/provider";
import { ElevenLabsClient, type Outcome } from "./client";

const KEY = "sk_0123456789abcdef_secret";

type Answer = { status?: number; body?: unknown };

/**
 * A client over a `fetch` that answers each request in turn, recording the
 * requests and what the client told of the account.
 */
function setup(
  answers: (Answer | ((init: RequestInit) => Promise<Response>))[],
  { key = KEY as string | null, timeoutMs = 10_000 } = {},
) {
  const requests: { url: URL; headers: Headers }[] = [];
  const outcomes: { outcome: Outcome; key: string }[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init = {}) => {
    requests.push({
      url: new URL(String(input)),
      headers: new Headers(init.headers),
    });
    const answer = answers.shift();
    if (typeof answer === "function") {
      return answer(init);
    }
    const { status = 200, body } = answer ?? {};
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status },
    );
  });
  const client = new ElevenLabsClient({
    key: () => key ?? undefined,
    onOutcome: (outcome, used) => outcomes.push({ outcome, key: used }),
    fetch,
    timeoutMs,
  });
  return { client, requests, outcomes, fetch };
}

function page(names: string[], next?: string) {
  return {
    body: {
      voices: names.map((name) => ({ voice_id: `id-${name}`, name })),
      has_more: next !== undefined,
      total_count: 0,
      next_page_token: next ?? null,
    },
  };
}

/** What a voices call failed with. */
async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ProviderError);
  return error as ProviderError;
}

describe("ElevenLabsClient.voices", () => {
  it("lists every page of My Voices, with the key in xi-api-key", async () => {
    const { client, requests, outcomes } = setup([
      page(["Rachel", "Adam"], "page-2"),
      page(["My Stream Voice"]),
    ]);

    expect(await client.voices()).toEqual([
      { id: "id-Rachel", name: "Rachel" },
      { id: "id-Adam", name: "Adam" },
      { id: "id-My Stream Voice", name: "My Stream Voice" },
    ]);

    expect(requests.map(({ url }) => url.pathname)).toEqual([
      "/v2/voices",
      "/v2/voices",
    ]);
    expect(requests[0].url.host).toBe("api.elevenlabs.io");
    expect(requests[0].url.searchParams.get("page_size")).toBe("100");
    expect(requests[0].url.searchParams.has("next_page_token")).toBe(false);
    expect(requests[1].url.searchParams.get("next_page_token")).toBe("page-2");
    expect(requests.map(({ headers }) => headers.get("xi-api-key"))).toEqual([
      KEY,
      KEY,
    ]);
    expect(outcomes).toEqual([
      { outcome: { connected: true }, key: KEY },
      { outcome: { connected: true }, key: KEY },
    ]);
  });

  it("names a voice by its id when it has no name, and skips one without an id", async () => {
    const { client } = setup([
      {
        body: {
          voices: [{ voice_id: "abc", name: " " }, { name: "No id" }, "Rachel"],
          has_more: false,
        },
      },
    ]);

    expect(await client.voices()).toEqual([{ id: "abc", name: "abc" }]);
  });

  it("asks nothing without a key, and says where to add one", async () => {
    const { client, fetch, outcomes } = setup([], { key: null });

    const error = await failure(client.voices());

    expect(error.kind).toBe("unavailable");
    expect(error.message).toBe(
      "There is no ElevenLabs API key — add one under ElevenLabs",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(outcomes).toEqual([]);
  });

  it.each([
    [401, "invalid_api_key", "Invalid API key"],
    [
      401,
      "missing_permissions",
      "The API key you used is missing the permission voices_read to execute this operation.",
    ],
    [
      403,
      "insufficient_permissions",
      "You do not have the required permissions for this action.",
    ],
    [
      402,
      "insufficient_credits",
      "Your account does not have enough credits for this operation.",
    ],
  ])(
    "is unavailable on a %i %s, in ElevenLabs' words, and the account is not connected",
    async (status, code, message) => {
      const { client, outcomes } = setup([
        { status, body: { detail: { type: "x", code, message } } },
      ]);

      const error = await failure(client.voices());

      expect([error.kind, error.message]).toEqual([
        "unavailable",
        `ElevenLabs: ${message}`,
      ]);
      expect(outcomes).toEqual([
        {
          outcome: { connected: false, reason: `ElevenLabs: ${message}` },
          key: KEY,
        },
      ]);
    },
  );

  it("is transient on a rate limit or ElevenLabs' own failure, which say nothing of the account", async () => {
    const { client, outcomes } = setup([
      {
        status: 429,
        body: { detail: { message: "Too many concurrent requests." } },
      },
      { status: 503, body: "<html>Service Unavailable</html>" },
    ]);

    const limited = await failure(client.voices());
    const down = await failure(client.voices());

    expect([limited.kind, limited.message]).toEqual([
      "transient",
      "ElevenLabs: Too many concurrent requests.",
    ]);
    expect([down.kind, down.message]).toEqual([
      "transient",
      "ElevenLabs: it answered 503",
    ]);
    expect(outcomes.map(({ outcome }) => outcome)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("is rejected on what it refuses, voice-missing on a voice it does not have — in the first message of a list", async () => {
    const { client } = setup([
      { status: 422, body: { detail: [{ loc: ["query"], msg: "Bad page" }] } },
      { status: 404, body: { detail: "Voice not found" } },
    ]);

    const refused = await failure(client.voices());
    const missing = await failure(client.voices());

    expect([refused.kind, refused.message]).toEqual([
      "rejected",
      "ElevenLabs: Bad page",
    ]);
    expect([missing.kind, missing.message]).toEqual([
      "voice-missing",
      "ElevenLabs: Voice not found",
    ]);
  });

  it("is transient without a way through to ElevenLabs, and the account is not connected", async () => {
    const { client, outcomes } = setup([
      async () => {
        throw new TypeError("fetch failed");
      },
    ]);

    const error = await failure(client.voices());

    expect([error.kind, error.message]).toEqual([
      "transient",
      "Cannot reach ElevenLabs: fetch failed",
    ]);
    expect(outcomes[0].outcome).toEqual({
      connected: false,
      reason: "Cannot reach ElevenLabs: fetch failed",
    });
  });

  it("gives up on a request that takes too long", async () => {
    const hanging = (init: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        ),
      );
    const { client, outcomes } = setup([hanging], { timeoutMs: 20 });

    const error = await failure(client.voices());

    expect([error.kind, error.message]).toEqual([
      "transient",
      "ElevenLabs did not answer within 0.02 s",
    ]);
    expect(outcomes[0].outcome).toMatchObject({ connected: false });
  });

  it("rejects with the signal's reason when stopped, telling nothing of the account", async () => {
    const abort = new AbortController();
    const { client, outcomes } = setup([
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
          abort.abort(new Error("stopped"));
        }),
    ]);

    await expect(client.voices(abort.signal)).rejects.toThrow("stopped");
    expect(outcomes).toEqual([]);
  });

  it("never puts the key in a reason", async () => {
    const { client, outcomes } = setup([
      { status: 401, body: { detail: { message: "Invalid API key" } } },
      { status: 500, body: "" },
      async () => {
        throw new TypeError("fetch failed", { cause: new Error("ENOTFOUND") });
      },
    ]);

    const reasons = [
      (await failure(client.voices())).message,
      (await failure(client.voices())).message,
      (await failure(client.voices())).message,
      ...outcomes.map(({ outcome }) => JSON.stringify(outcome ?? null)),
    ];

    for (const reason of reasons) {
      expect(reason).not.toContain(KEY);
    }
  });
});
