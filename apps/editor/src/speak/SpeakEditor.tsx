import { EditorPage, TemplateField, useActionSettings } from "@fluxta/sdk/ui";
import type { SpeakSettings } from "tts-protocol";

export function SpeakEditor() {
  const { values, set } = useActionSettings<SpeakSettings>({ text: "" });

  return (
    <EditorPage>
      <TemplateField
        label="Text"
        multiline
        value={values.text ?? ""}
        onChange={set("text")}
        placeholder="A chat message, for example"
        hint="Read aloud in this computer’s voice, one Phrase after another. The step does not wait for it to be spoken; text that comes out empty is not spoken."
      />
    </EditorPage>
  );
}
