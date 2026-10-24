import { spawn, type ChildProcess } from "node:child_process";

import { describe, expect, it } from "vitest";

import type { Voice } from "../../speech/provider";
import { wavDuration } from "../../speech/wav";
import type { Spawn } from "../script-process";
import { encodedCommand, PowerShellProcess } from "./powershell-process";
import synthesizerScript from "./synthesizer.ps1";
import { WindowsPlayer } from "./windows-player";
import { WindowsProvider } from "./windows-provider";

/**
 * The PowerShell scripts against the real SAPI and WinRT. Nothing is heard:
 * every play runs at volume 0. It prints the voices it finds, for the
 * record of what each store holds.
 */
describe.runIf(process.platform === "win32")(
  "Windows engines",
  { timeout: 60_000 },
  () => {
    const signal = () => new AbortController().signal;
    const provider = new WindowsProvider();
    const seconds = async (text: string, voice: Voice, rate = 1) =>
      wavDuration(
        await provider.synthesize(text, voice.id, { rate }, signal()),
      );
    const stores = async () => {
      const voices = await provider.voices();
      return {
        voices,
        oneCore: voices.find(({ id }) => id.startsWith("onecore:")),
        sapi: voices.find(({ id }) => id.startsWith("sapi:")),
        fallback: voices.find(({ isDefault }) => isDefault) ?? voices[0],
      };
    };

    it("lists both stores' voices, each once, the OS's default among them", async () => {
      const { voices } = await stores();
      console.info(
        voices
          .map(
            ({ id, name, language, isDefault }) =>
              `${isDefault ? "*" : " "} ${name} (${language}) ${id}`,
          )
          .join("\n"),
      );

      expect(voices.length).toBeGreaterThan(0);
      expect(voices.filter(({ isDefault }) => isDefault)).toHaveLength(1);
      expect(new Set(voices.map(({ id }) => id)).size).toBe(voices.length);
      expect(voices.every(({ id }) => /^(onecore|sapi):./.test(id))).toBe(true);
    });

    it("speaks with a voice of each store", async () => {
      const { oneCore, sapi } = await stores();

      for (const voice of [oneCore, sapi].filter((found) => found)) {
        const audio = await provider.synthesize(
          "Hello, chat!",
          voice!.id,
          { rate: 1 },
          signal(),
        );
        const view = new DataView(audio.buffer, audio.byteOffset);
        console.info(
          `${voice!.name}: ${view.getUint32(24, true)} Hz, ${view.getUint16(22, true)} channel(s), ${view.getUint16(34, true)}-bit`,
        );
        expect(wavDuration(audio)).toBeGreaterThan(0.3);
      }
    });

    it("reads markup as text, in both stores", async () => {
      const { oneCore, sapi } = await stores();

      for (const voice of [oneCore, sapi].filter((found) => found)) {
        // A pause read as SSML would add 20 s; said aloud it takes a few.
        expect(
          await seconds('Wait <break time="20s"/> & <speak>here', voice!),
        ).toBeLessThan(12);
      }
    });

    it("is slower at 0.5× and faster at 2×, in both stores", async () => {
      const { oneCore, sapi } = await stores();
      const text = "The quick brown fox jumps over the lazy dog.";

      for (const voice of [oneCore, sapi].filter((found) => found)) {
        const [slow, normal, fast] = [
          await seconds(text, voice!, 0.5),
          await seconds(text, voice!, 1),
          await seconds(text, voice!, 2),
        ];
        console.info(
          `${voice!.name}: 0.5× ${slow} s, 1× ${normal} s, 2× ${fast} s`,
        );
        expect(slow).toBeGreaterThan(normal * 1.3);
        expect(fast).toBeLessThan(normal / 1.3);
      }
    });

    it("speaks Russian with a Russian voice, when one is installed", async () => {
      const { voices } = await stores();
      const russian = voices.find(({ language }) => language === "ru-RU");

      if (russian) {
        expect(await seconds("Привет, чат!", russian)).toBeGreaterThan(0.3);
      }
    });

    it("reports a voice that is not here", async () => {
      await expect(
        provider.synthesize(
          "Hi",
          "onecore:HKEY_LOCAL_MACHINE\\Gone",
          { rate: 1 },
          signal(),
        ),
      ).rejects.toMatchObject({ kind: "voice-missing" });
    });

    it("plays a Phrase to its end on System default, silently", async () => {
      const { fallback } = await stores();
      const audio = await provider.synthesize(
        "One two",
        fallback.id,
        { rate: 2 },
        signal(),
      );

      const requested = Date.now();
      let started = 0;
      await new WindowsPlayer().play(
        audio,
        {
          volume: 0,
          device: "system-default",
          onStarted: () => (started = Date.now()),
        },
        signal(),
      );
      const ended = Date.now();

      console.info(
        `Request to start: ${started - requested} ms; start to end: ${ended - started} ms of ${Math.round(wavDuration(audio) * 1000)} ms`,
      );
      expect(started).toBeGreaterThanOrEqual(requested);
      expect(ended - started).toBeGreaterThanOrEqual(
        wavDuration(audio) * 1000 - 200,
      );
    });

    it("stops a play at once when aborted", async () => {
      const { fallback } = await stores();
      const audio = await provider.synthesize(
        "A sentence long enough to be stopped in the middle of it.",
        fallback.id,
        { rate: 1 },
        signal(),
      );
      const abort = new AbortController();
      const player = new WindowsPlayer();

      const played = player.play(
        audio,
        { volume: 0, device: "system-default" },
        abort.signal,
      );
      setTimeout(
        () => abort.abort(new DOMException("Stopped", "AbortError")),
        1500,
      );
      await expect(played).rejects.toMatchObject({ name: "AbortError" });

      // The next play is not queued behind the stopped one.
      const started = Date.now();
      await player.play(
        await provider.synthesize("One", fallback.id, { rate: 2 }, signal()),
        { volume: 0, device: "system-default" },
        signal(),
      );
      expect(Date.now() - started).toBeLessThan(3000);
    });

    it("starts the synthesizer again after it was killed", async () => {
      const children: ChildProcess[] = [];
      const restarting = new WindowsProvider(
        new PowerShellProcess(
          "synthesizer",
          synthesizerScript,
          (command, args) => {
            const child = spawn(command, args, {
              stdio: "pipe",
              windowsHide: true,
            });
            children.push(child);
            return child;
          },
        ),
      );
      const [voice] = await restarting.voices();

      children[0].kill();
      await new Promise((resolve) => children[0].once("exit", resolve));

      const audio = await restarting.synthesize(
        "Back",
        voice.id,
        { rate: 1 },
        signal(),
      );
      expect(children).toHaveLength(2);
      expect(wavDuration(audio)).toBeGreaterThan(0);
    });

    it("is unavailable under ConstrainedLanguage, with the reason", async () => {
      // As AppLocker or WDAC would have it: the session is put into
      // ConstrainedLanguage before the bootstrap runs.
      const constrained: Spawn = (command, args) => {
        const bootstrap = Buffer.from(args.at(-1)!, "base64").toString(
          "utf16le",
        );
        const locked = `$ExecutionContext.SessionState.LanguageMode = 'ConstrainedLanguage'\n${bootstrap}`;
        return spawn(command, [...args.slice(0, -1), encodedCommand(locked)], {
          stdio: "pipe",
          windowsHide: true,
        });
      };
      const locked = new WindowsProvider(
        new PowerShellProcess("synthesizer", synthesizerScript, constrained),
      );

      await expect(locked.voices()).rejects.toMatchObject({
        kind: "unavailable",
        message:
          "PowerShell runs in ConstrainedLanguage mode — Text to Speech cannot run on this machine",
      });
    });
  },
);
