// A small searchable list over Details (plan phase 4 step 5b): an asset
// reference's Browse and Add Component pick from it. Escape, a click outside
// or Cancel closes it with nothing. Text is set with textContent.

export interface PickerItem {
  readonly id: string;
  readonly label: string;
  /** Dim text after the label (a type, a folder). */
  readonly note?: string;
  /** Why it cannot be picked; shown as the tooltip. */
  readonly disabled?: string | null;
}

export interface PickerOptions {
  readonly document: Document;
  /** Where the list opens (Details' panel). */
  readonly host: HTMLElement;
  readonly title: string;
  readonly items: readonly PickerItem[];
  /** `data-testid` of the list; its items are `<testId>-item` with `data-id`. */
  readonly testId: string;
}

/** Opens the list; resolves to the picked item's id or null. */
export function openPicker(options: PickerOptions): Promise<string | null> {
  const doc = options.document;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  options.host.querySelector(":scope > .details-picker")?.remove();
  return new Promise((resolve) => {
    const panel = el("div", "details-picker");
    panel.dataset.testid = options.testId;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", options.title);
    const head = el("div", "details-picker-head");
    const cancel = el("button", "detail-inline-button", "Cancel");
    cancel.type = "button";
    head.append(el("strong", "", options.title), cancel);
    const search = el("input", "details-picker-search");
    search.type = "search";
    search.placeholder = "Search";
    search.setAttribute("aria-label", "Search");
    const list = el("div", "details-picker-list");
    panel.append(head, search, list);

    const draw = (): void => {
      const query = search.value.trim().toLocaleLowerCase();
      const shown = options.items.filter((item) => query === "" || item.label.toLocaleLowerCase().includes(query) || (item.note ?? "").toLocaleLowerCase().includes(query));
      list.replaceChildren(
        ...(shown.length === 0
          ? [el("div", "details-picker-empty", "Eşleşen öğe yok.")]
          : shown.map((item) => {
              const button = el("button", "details-picker-item");
              button.type = "button";
              button.dataset.testid = `${options.testId}-item`;
              button.dataset.id = item.id;
              button.append(el("span", "", item.label));
              if (item.note) button.append(el("small", "", item.note));
              if (item.disabled) {
                button.disabled = true;
                button.title = item.disabled;
              }
              button.addEventListener("click", () => close(item.id));
              return button;
            })),
      );
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(null);
      } else if (event.key === "Enter") {
        list.querySelector<HTMLButtonElement>(".details-picker-item:not(:disabled)")?.click();
      }
    };
    const onOutside = (event: PointerEvent): void => {
      if (!panel.contains(event.target as Node)) close(null);
    };
    const close = (picked: string | null): void => {
      panel.remove();
      doc.removeEventListener("pointerdown", onOutside, true);
      resolve(picked);
    };
    cancel.addEventListener("click", () => close(null));
    search.addEventListener("input", draw);
    panel.addEventListener("keydown", onKey);
    draw();
    options.host.append(panel);
    // After this event: the click that opened it must not close it.
    setTimeout(() => doc.addEventListener("pointerdown", onOutside, true), 0);
    search.focus();
  });
}
