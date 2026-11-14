// The Content Browser's import dialog (plan phase 4 step 6e; INV-A25; user
// decisions 2026-11-14): what a batch of imported files' meta files say,
// asked once for the batch: the license (an SPDX id or `LicenseRef-<name>`;
// D16 refuses `Unknown` and `NOASSERTION`) and the source (origin required,
// author and URL optional); for a GLB, its optimisation (on by default:
// texture size limit + WebP, meshopt geometry, normal maps kept, embedded
// textures stripped only when asked). The last answers are the page's, so the
// next batch starts from them. Import stays off until license and origin are
// there. Escape or Cancel gives null. Text is set with textContent.

export interface ImportOptimize {
  readonly enabled: boolean;
  readonly maxTextureSize: number;
  readonly keepNormals: boolean;
  readonly meshopt: boolean;
  readonly stripTextures: boolean;
}

export interface ImportChoice {
  readonly license: string;
  readonly source: { readonly origin: string; readonly author?: string; readonly url?: string };
  /** Null when the batch has no GLB. */
  readonly optimize: ImportOptimize | null;
}

/** Licenses offered first; `Other…` takes any SPDX id or LicenseRef. */
export const IMPORT_LICENSES = ["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "MIT", "Apache-2.0", "LicenseRef-forge-project"] as const;
const OTHER = "__other__";
const TEXTURE_SIZES = [512, 1024, 2048, 4096] as const;
const STORAGE_KEY = "forge.contentImport";
const DEFAULT_OPTIMIZE: ImportOptimize = { enabled: true, maxTextureSize: 1024, keepNormals: true, meshopt: true, stripTextures: false };

/** What a license field may hold: one SPDX-like id or a LicenseRef, never Unknown / NOASSERTION (D16). */
export function licenseProblem(license: string): string | null {
  const value = license.trim();
  if (value === "") return "Lisans gerekli.";
  if (/^(unknown|noassertion)$/i.test(value)) return "Lisans bilinmiyor olamaz (D16): bir SPDX kimliği ya da LicenseRef-<ad> yazın.";
  if (!/^[A-Za-z0-9.+-]+$/.test(value)) return "Tek bir SPDX kimliği ya da LicenseRef-<ad> yazın.";
  return null;
}

interface Remembered {
  license?: string;
  origin?: string;
  author?: string;
  url?: string;
  optimize?: Partial<ImportOptimize>;
}

function readRemembered(storage: Storage | null): Remembered {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "{}");
    return parsed !== null && typeof parsed === "object" ? (parsed as Remembered) : {};
  } catch {
    return {};
  }
}

export function openImportDialog(options: {
  readonly document: Document;
  /** Where the dialog opens (the drawer). */
  readonly host: HTMLElement;
  readonly files: readonly string[];
  readonly storage: Storage | null;
}): Promise<ImportChoice | null> {
  const doc = options.document;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const remembered = readRemembered(options.storage);
  const hasModel = options.files.some((name) => /\.(glb|gltf)$/i.test(name));
  options.host.querySelector(":scope > .content-import-dialog")?.remove();

  return new Promise((resolve) => {
    const dialog = el("div", "content-import-dialog");
    dialog.dataset.testid = "content-import-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "Import");
    const title = el("strong", "", `Import ${options.files.length} file${options.files.length === 1 ? "" : "s"}`);
    const list = el("div", "content-import-files", options.files.join(", "));
    const row = (label: string, field: HTMLElement, hint?: string): HTMLElement => {
      const wrap = el("label", "content-import-row");
      wrap.append(el("span", "", label), field);
      if (hint) wrap.title = hint;
      return wrap;
    };
    const input = (testId: string, value: string, placeholder = ""): HTMLInputElement => {
      const node = el("input", "content-import-input");
      node.type = "text";
      node.value = value;
      node.placeholder = placeholder;
      node.dataset.testid = testId;
      return node;
    };

    const license = el("select", "content-import-input");
    license.dataset.testid = "content-import-license";
    for (const id of IMPORT_LICENSES) license.append(new Option(id, id));
    license.append(new Option("Other…", OTHER));
    const other = input("content-import-license-other", "", "SPDX id or LicenseRef-<name>");
    const startLicense = remembered.license ?? "";
    if ((IMPORT_LICENSES as readonly string[]).includes(startLicense)) license.value = startLicense;
    else if (startLicense !== "") {
      license.value = OTHER;
      other.value = startLicense;
    } else license.value = IMPORT_LICENSES[0];
    const origin = input("content-import-origin", remembered.origin ?? "", "Where it comes from (required)");
    const author = input("content-import-author", remembered.author ?? "");
    const url = input("content-import-url", remembered.url ?? "", "https://…");

    const saved = { ...DEFAULT_OPTIMIZE, ...remembered.optimize };
    const check = (testId: string, on: boolean): HTMLInputElement => {
      const node = el("input");
      node.type = "checkbox";
      node.checked = on;
      node.dataset.testid = testId;
      return node;
    };
    const optimize = check("content-import-optimize", saved.enabled);
    const size = el("select", "content-import-input");
    size.dataset.testid = "content-import-size";
    for (const px of TEXTURE_SIZES) size.append(new Option(`${px} px`, String(px)));
    size.value = String((TEXTURE_SIZES as readonly number[]).includes(saved.maxTextureSize) ? saved.maxTextureSize : DEFAULT_OPTIMIZE.maxTextureSize);
    const keepNormals = check("content-import-keep-normals", saved.keepNormals);
    const meshopt = check("content-import-meshopt", saved.meshopt);
    const strip = check("content-import-strip", saved.stripTextures);

    const problem = el("div", "content-import-problem");
    const confirm = el("button", "forge-btn-primary", "Import");
    confirm.type = "button";
    confirm.dataset.testid = "content-import-confirm";
    const cancel = el("button", "forge-btn-ghost", "Cancel");
    cancel.type = "button";
    cancel.dataset.testid = "content-import-cancel";
    const actions = el("div", "content-import-actions");
    actions.append(cancel, confirm);

    const licenseValue = (): string => (license.value === OTHER ? other.value.trim() : license.value);
    const refresh = (): void => {
      other.hidden = license.value !== OTHER;
      const why = licenseProblem(licenseValue()) ?? (origin.value.trim() === "" ? "Kaynak (origin) gerekli." : null);
      problem.textContent = why ?? "";
      confirm.disabled = why !== null;
      for (const node of [size, keepNormals, meshopt, strip]) node.disabled = !optimize.checked;
    };

    dialog.append(
      title,
      list,
      row("License", license, "Asset'in lisansı (D16): SPDX kimliği ya da LicenseRef-<ad>."),
      other,
      row("Origin", origin, "Nereden geldiği: üretici, mağaza, çekim, 'authored'…"),
      row("Author", author),
      row("URL", url),
    );
    if (hasModel) {
      const section = el("div", "content-import-optimize");
      section.append(
        el("strong", "", "GLB"),
        row("Optimize", optimize, "Dokular WebP ve boyut sınırı, geometri meshopt; ayarlar meta'da kalır, Reimport aynısını uygular."),
        row("Max Texture Size", size),
        row("Keep Normal Maps", keepNormals),
        row("Compress Geometry", meshopt),
        row("Strip Embedded Textures", strip, "Slotlar projenin materyallerini kullanıyorsa gömülü dokular atılır."),
      );
      dialog.append(section);
    }
    dialog.append(problem, actions);

    const close = (choice: ImportChoice | null): void => {
      dialog.remove();
      resolve(choice);
    };
    cancel.addEventListener("click", () => close(null));
    confirm.addEventListener("click", () => {
      if (confirm.disabled) return;
      const chosen: ImportChoice = {
        license: licenseValue(),
        source: {
          origin: origin.value.trim(),
          ...(author.value.trim() !== "" ? { author: author.value.trim() } : {}),
          ...(url.value.trim() !== "" ? { url: url.value.trim() } : {}),
        },
        optimize: hasModel
          ? { enabled: optimize.checked, maxTextureSize: Number(size.value), keepNormals: keepNormals.checked, meshopt: meshopt.checked, stripTextures: strip.checked }
          : null,
      };
      try {
        const keep: Remembered = { license: chosen.license, origin: chosen.source.origin, author: author.value.trim(), url: url.value.trim(), ...(chosen.optimize ? { optimize: chosen.optimize } : remembered.optimize ? { optimize: remembered.optimize } : {}) };
        options.storage?.setItem(STORAGE_KEY, JSON.stringify(keep));
      } catch {
        // The page keeps nothing; the next batch asks from the defaults.
      }
      close(chosen);
    });
    dialog.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") close(null);
      else if (event.key === "Enter" && !confirm.disabled) confirm.click();
    });
    for (const node of [license, other, origin, optimize]) node.addEventListener("input", refresh);
    license.addEventListener("change", refresh);
    optimize.addEventListener("change", refresh);
    refresh();
    options.host.append(dialog);
    origin.focus();
  });
}
