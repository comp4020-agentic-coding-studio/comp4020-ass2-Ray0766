import { composePrompt, DEFAULT_FIELDS, type PromptFields } from "../lib/prompt-composer";

const form = document.querySelector<HTMLFormElement>("[data-prompt-composer]");
if (form) {
  const output = form.querySelector<HTMLParagraphElement>("[data-output]");
  const copyButton = form.querySelector<HTMLButtonElement>("[data-copy]");

  const readFields = (): PromptFields => {
    const fields = { ...DEFAULT_FIELDS };
    for (const key of Object.keys(fields) as Array<keyof PromptFields>) {
      const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field="${key}"]`);
      if (el) fields[key] = el.value;
    }
    return fields;
  };

  const update = () => {
    if (output) output.textContent = composePrompt(readFields());
  };

  form.addEventListener("input", update);
  form.addEventListener("change", update);

  copyButton?.addEventListener("click", () => {
    const text = output?.textContent ?? "";
    navigator.clipboard?.writeText(text);
  });
}
