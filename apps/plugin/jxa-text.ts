/**
 * Loads a `.jxa` script as its source text. The scripts are what `osascript`
 * runs, not code of the sidecar, so they ship inside the bundle as strings —
 * nothing beside `index.mjs` to find at run time. One plugin for tsdown and
 * vitest alike: both call a Rollup-style `transform` hook.
 */
export function jxaText() {
  return {
    name: "jxa-text",
    transform(code: string, id: string) {
      if (!id.endsWith(".jxa")) {
        return null;
      }
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    },
  };
}
