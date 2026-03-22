import { CHANNEL_NAME, type ChannelMessage } from "./channel.ts";
import { preloadImage } from "./image-utils.ts";

interface ManifestImage {
  filename: string;
  path: string;
}

interface ManifestCategory {
  name: string;
  images: ManifestImage[];
}

interface ManifestPerson {
  name: string;
  index: number;
  categories: ManifestCategory[];
}

interface Manifest {
  people: ManifestPerson[];
}

interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

interface WorkspacesResponse {
  currentWorkspaceId: string | null;
  workspaces: Workspace[];
}

const channel = new BroadcastChannel(CHANNEL_NAME);

let manifest: Manifest | null = null;
let previewUrl: string | null = null;
let programUrl: string | null = null;
let currentWorkspaceId: string | null = null;
let allThumbElements: HTMLElement[] = [];
let thumbByUrl = new Map<string, HTMLElement>();
let cachedVisibleThumbs: HTMLElement[] = [];
let selectedIndex = -1;
let currentSelectedEl: HTMLElement | null = null;
let currentOnAirEl: HTMLElement | null = null;

const thumbGrid = document.getElementById("thumb-grid")!;
const previewImg = document.getElementById("preview-img") as HTMLImageElement;
const previewPlaceholder = document.getElementById("preview-placeholder")!;
const previewLoading = document.getElementById("preview-loading")!;
const previewFilename = document.getElementById("preview-filename")!;
const pgmImg = document.getElementById("pgm-img") as HTMLImageElement;
const pgmPlaceholder = document.getElementById("pgm-placeholder")!;
const pgmFilename = document.getElementById("pgm-filename")!;
const personTabs = document.getElementById("person-tabs")!;
const btnTake = document.getElementById("btn-take")!;
const btnBlack = document.getElementById("btn-black")!;
const btnOpenPgm = document.getElementById("btn-open-pgm")!;
const gridArea = document.getElementById("grid-area")!;
const wsSelect = document.getElementById("workspace-select") as HTMLSelectElement;
const wsDialog = document.getElementById("ws-dialog") as HTMLDialogElement;
const wsList = document.getElementById("ws-list")!;
const wsAddForm = document.getElementById("ws-add-form") as HTMLFormElement;
const wsNameInput = document.getElementById("ws-name") as HTMLInputElement;
const wsPathInput = document.getElementById("ws-path") as HTMLInputElement;
const wsBrowseDialog = document.getElementById("ws-browse-dialog") as HTMLDialogElement;
const browseCurrentPath = document.getElementById("browse-current-path")!;
const browseList = document.getElementById("browse-list")!;
const wsError = document.getElementById("ws-error")!;

function createKeyBadge(text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "key";
  span.textContent = text;
  return span;
}

function buildEncodedPath(
  prefix: string,
  personName: string,
  categoryName: string,
  filename: string,
): string {
  return (
    prefix +
    encodeURIComponent(personName) +
    "/" +
    encodeURIComponent(categoryName) +
    "/" +
    encodeURIComponent(filename)
  );
}

function refreshVisibleThumbs(): void {
  cachedVisibleThumbs = allThumbElements.filter((el) => {
    const section = el.closest(".person-section");
    return section && !section.classList.contains("hidden-person");
  });
}

function getAvailableSize(section: HTMLElement, container: HTMLElement): { w: number; h: number } {
  const sectionH = section.clientHeight;
  const siblings = section.children;
  let usedH = 0;
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i] !== container) {
      usedH += (siblings[i] as HTMLElement).offsetHeight;
      const style = getComputedStyle(siblings[i] as HTMLElement);
      usedH += parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    }
  }
  return { w: section.clientWidth, h: Math.max(0, sectionH - usedH) };
}

function getRatio(imgOrRatio: HTMLImageElement | number): number {
  if (typeof imgOrRatio === "number") return imgOrRatio;
  if (!imgOrRatio.naturalWidth || !imgOrRatio.naturalHeight) return 0;
  return imgOrRatio.naturalWidth / imgOrRatio.naturalHeight;
}

function resetContainerForMeasure(container: HTMLElement): void {
  container.style.flex = "1";
  container.style.width = "";
  container.style.height = "";
}

function applyContainerFit(container: HTMLElement, ratio: number): void {
  const section = container.parentElement;
  if (!section) return;
  const avail = getAvailableSize(section, container);
  if (avail.w <= 0 || avail.h <= 0) return;

  let w: number;
  let h: number;
  if (avail.w / avail.h > ratio) {
    h = avail.h;
    w = h * ratio;
  } else {
    w = avail.w;
    h = w / ratio;
  }
  container.style.flex = "none";
  container.style.width = Math.floor(w) + "px";
  container.style.height = Math.floor(h) + "px";
}

function fitContainerToAspectRatio(
  container: HTMLElement,
  imgOrRatio: HTMLImageElement | number,
): void {
  const ratio = getRatio(imgOrRatio);
  if (!ratio || !isFinite(ratio)) return;
  resetContainerForMeasure(container);
  applyContainerFit(container, ratio);
}

const DEFAULT_RATIO = 16 / 9;

function clearContainerFit(container: HTMLElement): void {
  fitContainerToAspectRatio(container, DEFAULT_RATIO);
}

function refitAllContainers(): void {
  const prevRatio = previewImg.classList.contains("visible") ? getRatio(previewImg) : 0;
  const pgmRatio = pgmImg.classList.contains("visible") ? getRatio(pgmImg) : 0;
  const targets = [
    {
      container: previewImg.parentElement!,
      ratio: prevRatio && isFinite(prevRatio) ? prevRatio : DEFAULT_RATIO,
    },
    {
      container: pgmImg.parentElement!,
      ratio: pgmRatio && isFinite(pgmRatio) ? pgmRatio : DEFAULT_RATIO,
    },
  ];
  for (const target of targets) resetContainerForMeasure(target.container);
  for (const target of targets) applyContainerFit(target.container, target.ratio);
}

// --- Workspace functions ---

async function loadWorkspaces(): Promise<void> {
  const res = await fetch("/api/workspaces");
  const data = (await res.json()) as WorkspacesResponse;
  currentWorkspaceId = data.currentWorkspaceId;

  wsSelect.replaceChildren();
  for (const ws of data.workspaces) {
    const opt = document.createElement("option");
    opt.value = ws.id;
    opt.textContent = ws.name;
    if (ws.id === data.currentWorkspaceId) opt.selected = true;
    wsSelect.appendChild(opt);
  }
}

async function switchWorkspace(id: string): Promise<void> {
  if (id === currentWorkspaceId) return;

  const res = await fetch(`/api/workspaces/${id}/activate`, { method: "POST" });
  if (!res.ok) return;

  const data = (await res.json()) as { workspace: Workspace; manifest: Manifest };
  currentWorkspaceId = data.workspace.id;
  manifest = data.manifest;

  clearPreviewAndProgram();
  channel.postMessage({ type: "workspace-changed" } satisfies ChannelMessage);

  renderTabs();
  renderGrid();
  allThumbElements = Array.from(document.querySelectorAll<HTMLElement>(".thumb-item"));
  thumbByUrl = new Map(allThumbElements.map((el) => [el.dataset.imageUrl!, el]));
  refreshVisibleThumbs();
}

function clearPreviewAndProgram(): void {
  previewUrl = null;
  programUrl = null;
  previewImg.classList.remove("visible");
  previewPlaceholder.classList.remove("hidden");
  previewFilename.textContent = "";
  clearContainerFit(previewImg.parentElement!);
  pgmImg.classList.remove("visible");
  pgmPlaceholder.classList.remove("hidden");
  pgmPlaceholder.textContent = "No output";
  pgmFilename.textContent = "";
  clearContainerFit(pgmImg.parentElement!);
  if (currentSelectedEl) {
    currentSelectedEl.classList.remove("selected");
    currentSelectedEl = null;
  }
  if (currentOnAirEl) {
    currentOnAirEl.classList.remove("on-air");
    currentOnAirEl = null;
  }
  selectedIndex = -1;
}

async function renderWsDialog(): Promise<void> {
  const res = await fetch("/api/workspaces");
  const data = (await res.json()) as WorkspacesResponse;

  wsList.replaceChildren();
  for (const ws of data.workspaces) {
    const item = document.createElement("div");
    item.className = "ws-item" + (ws.id === data.currentWorkspaceId ? " active" : "");

    const info = document.createElement("div");
    info.className = "ws-item-info";

    const nameDiv = document.createElement("div");
    nameDiv.className = "ws-item-name";
    nameDiv.textContent = ws.name;
    info.appendChild(nameDiv);

    const pathDiv = document.createElement("div");
    pathDiv.className = "ws-item-path";
    pathDiv.textContent = ws.path;
    info.appendChild(pathDiv);

    item.appendChild(info);

    if (ws.id !== data.currentWorkspaceId) {
      const actions = document.createElement("div");
      actions.className = "ws-item-actions";
      const delBtn = document.createElement("button");
      delBtn.className = "ws-delete-btn";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async () => {
        const delRes = await fetch(`/api/workspaces/${ws.id}`, { method: "DELETE" });
        if (delRes.ok) {
          await renderWsDialog();
          await loadWorkspaces();
        }
      });
      actions.appendChild(delBtn);
      item.appendChild(actions);
    }

    wsList.appendChild(item);
  }
}

function showWsError(msg: string): void {
  wsError.textContent = msg;
  wsError.classList.remove("hidden");
}

function hideWsError(): void {
  wsError.classList.add("hidden");
}

// --- Init ---

async function init(): Promise<void> {
  await loadWorkspaces();

  const res = await fetch("/api/manifest");
  manifest = (await res.json()) as Manifest;
  renderTabs();
  renderGrid();
  allThumbElements = Array.from(document.querySelectorAll<HTMLElement>(".thumb-item"));
  thumbByUrl = new Map(allThumbElements.map((el) => [el.dataset.imageUrl!, el]));
  refreshVisibleThumbs();
}

function renderTabs(): void {
  if (!manifest) return;

  const allBtn = personTabs.querySelector<HTMLElement>('[data-person="all"]')!;
  personTabs.replaceChildren(allBtn);
  allBtn.classList.add("active");

  for (const person of manifest.people) {
    const btn = document.createElement("button");
    btn.className = "tab";
    btn.dataset.person = person.name;
    btn.textContent = person.name;
    btn.appendChild(createKeyBadge(String(person.index)));
    personTabs.appendChild(btn);
  }
}

function renderGrid(): void {
  if (!manifest) return;
  thumbGrid.replaceChildren();

  for (const person of manifest.people) {
    const section = document.createElement("div");
    section.className = "person-section";
    section.dataset.person = person.name;

    const personHeader = document.createElement("div");
    personHeader.className = "person-header";
    personHeader.textContent = person.name;
    section.appendChild(personHeader);

    for (const category of person.categories) {
      const catHeader = document.createElement("div");
      catHeader.className = "category-header";
      catHeader.textContent = category.name;
      section.appendChild(catHeader);

      const row = document.createElement("div");
      row.className = "thumb-row";

      for (const image of category.images) {
        const item = document.createElement("div");
        item.className = "thumb-item";
        item.dataset.imageUrl = buildEncodedPath(
          "/images/",
          person.name,
          category.name,
          image.filename,
        );
        item.dataset.person = person.name;

        const img = document.createElement("img");
        img.src = buildEncodedPath("/thumbnails/", person.name, category.name, image.filename);
        img.alt = image.filename;
        img.loading = "lazy";
        item.appendChild(img);

        const nameDiv = document.createElement("div");
        nameDiv.className = "thumb-name";
        nameDiv.textContent = image.filename.replace(/\.[^.]+$/, "");
        item.appendChild(nameDiv);

        row.appendChild(item);
      }

      section.appendChild(row);
    }

    thumbGrid.appendChild(section);
  }
}

function getThumbFilename(el: HTMLElement | null): string {
  return el ? el.querySelector(".thumb-name")?.textContent || "" : "";
}

function setPreview(imageUrl: string, filename: string): void {
  previewUrl = imageUrl;
  previewPlaceholder.classList.add("hidden");
  previewLoading.classList.remove("hidden");
  previewImg.classList.remove("visible");

  preloadImage(imageUrl).then(
    (loaded) => {
      previewImg.src = imageUrl;
      previewImg.classList.add("visible");
      previewLoading.classList.add("hidden");
      fitContainerToAspectRatio(previewImg.parentElement!, loaded);
    },
    () => {
      previewLoading.textContent = "Load failed";
    },
  );

  previewFilename.textContent = filename || "";

  if (currentSelectedEl) currentSelectedEl.classList.remove("selected");
  const target = thumbByUrl.get(imageUrl);
  if (target) {
    target.classList.add("selected");
    currentSelectedEl = target;
    selectedIndex = cachedVisibleThumbs.indexOf(target);
  }
}

function take(): void {
  if (!previewUrl) return;

  programUrl = previewUrl;

  pgmPlaceholder.classList.add("hidden");
  preloadImage(programUrl).then(
    (loaded) => {
      pgmImg.src = loaded.src;
      pgmImg.classList.add("visible");
      fitContainerToAspectRatio(pgmImg.parentElement!, loaded);
    },
    () => {
      pgmPlaceholder.classList.remove("hidden");
      pgmPlaceholder.textContent = "Load failed";
    },
  );
  pgmFilename.textContent = previewFilename.textContent ?? "";

  if (currentOnAirEl) currentOnAirEl.classList.remove("on-air");
  const target = thumbByUrl.get(programUrl);
  if (target) {
    target.classList.add("on-air");
    currentOnAirEl = target;
  }

  channel.postMessage({ type: "take", imageUrl: programUrl } satisfies ChannelMessage);
}

function clearPreview(): void {
  previewUrl = null;
  previewImg.classList.remove("visible");
  previewPlaceholder.classList.remove("hidden");
  previewFilename.textContent = "";
  clearContainerFit(previewImg.parentElement!);
  if (currentSelectedEl) {
    currentSelectedEl.classList.remove("selected");
    currentSelectedEl = null;
  }
  selectedIndex = -1;
}

function blackOut(): void {
  programUrl = null;
  pgmImg.classList.remove("visible");
  pgmPlaceholder.classList.remove("hidden");
  pgmPlaceholder.textContent = "BLACK";
  pgmFilename.textContent = "";
  clearContainerFit(pgmImg.parentElement!);
  if (currentOnAirEl) {
    currentOnAirEl.classList.remove("on-air");
    currentOnAirEl = null;
  }
  channel.postMessage({ type: "black" } satisfies ChannelMessage);
}

function filterPerson(personName: string): void {
  document.querySelectorAll<HTMLElement>(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.person === personName);
  });

  document.querySelectorAll<HTMLElement>(".person-section").forEach((s) => {
    if (personName === "all") {
      s.classList.remove("hidden-person");
    } else {
      s.classList.toggle("hidden-person", s.dataset.person !== personName);
    }
  });

  refreshVisibleThumbs();
  selectedIndex = -1;
}

function navigateThumbs(direction: "up" | "down" | "left" | "right"): void {
  if (cachedVisibleThumbs.length === 0) return;

  if (selectedIndex < 0) {
    selectedIndex = 0;
  } else {
    const currentEl = cachedVisibleThumbs[selectedIndex];
    if (!currentEl) {
      selectedIndex = 0;
    } else {
      const thumbWidth = currentEl.offsetWidth + 6;
      const cols = Math.floor((gridArea.clientWidth - 16) / thumbWidth) || 1;

      switch (direction) {
        case "right":
          selectedIndex = Math.min(selectedIndex + 1, cachedVisibleThumbs.length - 1);
          break;
        case "left":
          selectedIndex = Math.max(selectedIndex - 1, 0);
          break;
        case "down":
          selectedIndex = Math.min(selectedIndex + cols, cachedVisibleThumbs.length - 1);
          break;
        case "up":
          selectedIndex = Math.max(selectedIndex - cols, 0);
          break;
      }
    }
  }

  const el = cachedVisibleThumbs[selectedIndex];
  if (el) {
    setPreview(el.dataset.imageUrl!, getThumbFilename(el));
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

thumbGrid.addEventListener("click", (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>(".thumb-item");
  if (!item) return;
  setPreview(item.dataset.imageUrl!, getThumbFilename(item));
});

thumbGrid.addEventListener("dblclick", (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>(".thumb-item");
  if (!item) return;
  setPreview(item.dataset.imageUrl!, getThumbFilename(item));
  take();
});

personTabs.addEventListener("click", (e) => {
  const tab = (e.target as HTMLElement).closest<HTMLElement>(".tab");
  if (!tab) return;
  filterPerson(tab.dataset.person!);
});

btnTake.addEventListener("click", take);
btnBlack.addEventListener("click", blackOut);
btnOpenPgm.addEventListener("click", () => {
  window.open("/program.html", "pgm-output", "width=1280,height=720");
});

document.addEventListener("keydown", (e) => {
  if (
    (e.target as HTMLElement).tagName === "INPUT" ||
    (e.target as HTMLElement).tagName === "TEXTAREA"
  )
    return;

  switch (e.key) {
    case " ":
    case "Enter":
      e.preventDefault();
      take();
      break;
    case "b":
    case "B":
      blackOut();
      break;
    case "Escape":
      clearPreview();
      break;
    case "ArrowRight":
      e.preventDefault();
      navigateThumbs("right");
      break;
    case "ArrowLeft":
      e.preventDefault();
      navigateThumbs("left");
      break;
    case "ArrowDown":
      e.preventDefault();
      navigateThumbs("down");
      break;
    case "ArrowUp":
      e.preventDefault();
      navigateThumbs("up");
      break;
    case "0":
      filterPerson("all");
      break;
    case "1":
    case "2":
    case "3":
    case "4":
    case "5": {
      const idx = parseInt(e.key) - 1;
      if (manifest && manifest.people[idx]) {
        filterPerson(manifest.people[idx].name);
      }
      break;
    }
  }
});

interface DragHandler<T> {
  init(startPos: number): T;
  move(snapshot: T, delta: number): void;
}

function initResizeHandles(): void {
  const STORAGE_KEY = "image-switcher-pane-sizes";
  const MIN_LEFT_WIDTH = 240;
  const MAX_LEFT_WIDTH = 600;
  const MIN_SECTION_HEIGHT = 80;

  const monitors = document.getElementById("monitors")!;
  const previewSection = document.getElementById("preview-section")!;
  const pgmSection = document.getElementById("pgm-section")!;
  const handleH = document.getElementById("handle-h")!;
  const handleV = document.getElementById("handle-v")!;

  function setMonitorWidth(px: number): void {
    monitors.style.width = px + "px";
    monitors.style.minWidth = px + "px";
  }

  function getHandleVSpace(): number {
    const style = getComputedStyle(handleV);
    return handleV.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
  }

  function getVerticalAvailable(): number {
    return monitors.clientHeight - getHandleVSpace();
  }

  function applyVerticalRatio(ratio: number): void {
    previewSection.style.flex = "none";
    pgmSection.style.flex = "none";
    const available = getVerticalAvailable();
    const previewH = Math.max(
      MIN_SECTION_HEIGHT,
      Math.min(available - MIN_SECTION_HEIGHT, available * ratio),
    );
    previewSection.style.height = previewH + "px";
    pgmSection.style.height = available - previewH + "px";
  }

  function saveSizes(): void {
    try {
      const total = previewSection.offsetHeight + pgmSection.offsetHeight;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          leftWidth: monitors.offsetWidth,
          previewRatio: total > 0 ? previewSection.offsetHeight / total : 0.6,
        }),
      );
    } catch {
      /* localStorage unavailable */
    }
  }

  function restoreSizes(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const sizes = JSON.parse(raw) as { leftWidth?: number; previewRatio?: number };
      if (sizes.leftWidth) {
        setMonitorWidth(Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, sizes.leftWidth)));
      }
      if (sizes.previewRatio) {
        applyVerticalRatio(sizes.previewRatio);
      }
    } catch {
      /* ignore */
    }
  }

  function createDragHandler<T>(
    handle: HTMLElement,
    axis: "h" | "v",
    onDrag: DragHandler<T>,
  ): void {
    const cls = "resizing-" + axis;
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startPos = axis === "h" ? e.clientX : e.clientY;
      const snapshot = onDrag.init(startPos);
      document.body.classList.add(cls);
      handle.classList.add("active");
      let rafId = 0;

      function onMove(ev: MouseEvent): void {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const pos = axis === "h" ? ev.clientX : ev.clientY;
          onDrag.move(snapshot, pos - startPos);
        });
      }

      function onUp(): void {
        cancelAnimationFrame(rafId);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.classList.remove(cls);
        handle.classList.remove("active");
        saveSizes();
        refitAllContainers();
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  createDragHandler(handleH, "h", {
    init: () => monitors.offsetWidth,
    move: (startWidth: number, delta: number) => {
      setMonitorWidth(Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, startWidth + delta)));
    },
  });

  createDragHandler(handleV, "v", {
    init: () => {
      previewSection.style.flex = "none";
      pgmSection.style.flex = "none";
      return { startH: previewSection.offsetHeight, available: getVerticalAvailable() };
    },
    move: (snap: { startH: number; available: number }, delta: number) => {
      const newH = Math.max(
        MIN_SECTION_HEIGHT,
        Math.min(snap.available - MIN_SECTION_HEIGHT, snap.startH + delta),
      );
      previewSection.style.height = newH + "px";
      pgmSection.style.height = snap.available - newH + "px";
    },
  });

  let resizeRafId = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeRafId);
    resizeRafId = requestAnimationFrame(() => {
      const w = monitors.offsetWidth;
      if (w > MAX_LEFT_WIDTH) setMonitorWidth(MAX_LEFT_WIDTH);
      if (w < MIN_LEFT_WIDTH) setMonitorWidth(MIN_LEFT_WIDTH);
      if (pgmSection.style.height) {
        const total = previewSection.offsetHeight + pgmSection.offsetHeight;
        if (total > 0) applyVerticalRatio(previewSection.offsetHeight / total);
      }
      refitAllContainers();
    });
  });

  restoreSizes();
}

// --- Directory browser ---

interface BrowseResponse {
  current: string;
  parent: string | null;
  directories: string[];
}

let browsePath = "";

async function loadBrowse(dirPath?: string): Promise<void> {
  const query = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
  const res = await fetch(`/api/browse${query}`);
  if (!res.ok) return;

  const data = (await res.json()) as BrowseResponse;
  browsePath = data.current;
  browseCurrentPath.textContent = data.current;

  browseList.replaceChildren();

  if (data.parent !== null) {
    const parentBtn = document.createElement("button");
    parentBtn.className = "browse-item browse-item-parent";
    parentBtn.textContent = ".. (parent)";
    parentBtn.addEventListener("click", () => void loadBrowse(data.parent!));
    browseList.appendChild(parentBtn);
  }

  for (const name of data.directories) {
    const btn = document.createElement("button");
    btn.className = "browse-item";
    btn.textContent = name;
    btn.addEventListener("click", () => void loadBrowse(data.current + "/" + name));
    browseList.appendChild(btn);
  }
}

// --- Workspace event listeners ---

wsSelect.addEventListener("change", () => {
  void switchWorkspace(wsSelect.value);
});

document.getElementById("btn-ws-add")!.addEventListener("click", () => {
  void renderWsDialog();
  hideWsError();
  wsDialog.showModal();
});

document.getElementById("btn-ws-manage")!.addEventListener("click", () => {
  void renderWsDialog();
  hideWsError();
  wsDialog.showModal();
});

document.getElementById("btn-ws-close")!.addEventListener("click", () => {
  wsDialog.close();
});

document.getElementById("btn-ws-browse")!.addEventListener("click", () => {
  const current = wsPathInput.value.trim();
  void loadBrowse(current || undefined);
  wsBrowseDialog.showModal();
});

document.getElementById("btn-browse-select")!.addEventListener("click", () => {
  wsPathInput.value = browsePath;
  wsBrowseDialog.close();
});

document.getElementById("btn-browse-cancel")!.addEventListener("click", () => {
  wsBrowseDialog.close();
});

wsAddForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideWsError();

  const name = wsNameInput.value.trim();
  const dirPath = wsPathInput.value.trim();
  if (!name || !dirPath) return;

  const res = await fetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, path: dirPath }),
  });

  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    showWsError(err.error);
    return;
  }

  wsNameInput.value = "";
  wsPathInput.value = "";
  await loadWorkspaces();
  await renderWsDialog();
});

void init();
initResizeHandles();
refitAllContainers();
