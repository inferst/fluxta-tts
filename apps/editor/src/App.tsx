import { EditorPage, TextField, useActionSettings } from "@fluxta/sdk/ui";

/** Whatever this Action needs to remember. Saved with the Action itself. */
type Settings = {
  message?: string;
};

export default function App() {
  // Loads what was saved, and hands back what is on screen when the user
  // presses Save. Nothing else to wire up.
  const { values, set } = useActionSettings<Settings>({
    message: "Hello from Fluxta!",
  });

  return (
    <EditorPage>
      <TextField
        label="Message"
        value={values.message ?? ""}
        onChange={set("message")}
        hint="Your Action reads this from its settings when it runs."
      />
    </EditorPage>
  );
}
