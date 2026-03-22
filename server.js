const express = require("express");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const workspaceStore = require("./workspace-store");

const app = express();
const PORT = process.env.PORT || 3456;
const THUMB_BASE = path.resolve(__dirname, ".thumbnails");

// --- Mutable state: swapped on workspace activation ---
let activeImageRoot = "";
let activeThumbRoot = "";
let activeManifest = { groups: [] };
let imageMiddleware = (_req, _res, next) => next();
let thumbMiddleware = (_req, _res, next) => next();

// --- Manifest & thumbnail helpers (parameterized) ---

const IMAGE_RE = /\.(jpe?g|png|webp)$/i;
const DEFAULT_SECTION = "(All)";

function collectImages(dir, prefix) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const results = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectImages(path.join(dir, entry.name), rel));
    } else if (IMAGE_RE.test(entry.name)) {
      results.push(rel);
    }
  }
  return results;
}

function jaSort(a, b) {
  if (a === DEFAULT_SECTION) return -1;
  if (b === DEFAULT_SECTION) return 1;
  return a.localeCompare(b, "ja");
}

function buildManifest(imageRoot) {
  const allPaths = collectImages(imageRoot, "");
  if (allPaths.length === 0) return { groups: [] };

  const groupMap = new Map();
  for (const relPath of allPaths) {
    const segments = relPath.split("/");
    const filename = segments[segments.length - 1];
    let groupName, categoryName;
    if (segments.length === 1) {
      groupName = DEFAULT_SECTION;
      categoryName = DEFAULT_SECTION;
    } else if (segments.length === 2) {
      groupName = segments[0];
      categoryName = DEFAULT_SECTION;
    } else {
      groupName = segments[0];
      categoryName = segments.slice(1, -1).join(" / ");
    }

    if (!groupMap.has(groupName)) groupMap.set(groupName, new Map());
    const catMap = groupMap.get(groupName);
    if (!catMap.has(categoryName)) catMap.set(categoryName, []);
    catMap.get(categoryName).push({ filename, path: relPath });
  }

  const groups = [];
  for (const gName of [...groupMap.keys()].sort(jaSort)) {
    const catMap = groupMap.get(gName);
    const categories = [...catMap.keys()].sort(jaSort).map((cName) => ({
      name: cName,
      images: catMap.get(cName).sort((a, b) => a.filename.localeCompare(b.filename, "ja")),
    }));
    groups.push({ name: gName, index: groups.length + 1, categories });
  }

  return { groups };
}

async function generateThumbnails(manifest, imageRoot, thumbRoot) {
  const CONCURRENCY = 8;
  let generated = 0;
  let skipped = 0;

  const tasks = [];
  for (const group of manifest.groups) {
    for (const category of group.categories) {
      for (const image of category.images) {
        tasks.push(image.path);
      }
    }
  }

  if (tasks.length === 0) return;

  const dirs = new Set(tasks.map((p) => path.dirname(path.join(thumbRoot, p))));
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async function (imagePath) {
        const destPath = path.join(thumbRoot, imagePath);

        try {
          await fs.promises.access(destPath);
          skipped++;
          return;
        } catch {
          // File doesn't exist, generate it
        }

        try {
          await sharp(path.join(imageRoot, imagePath))
            .resize(400, null, { withoutEnlargement: true })
            .jpeg({ quality: 60 })
            .toFile(destPath);
          generated++;
          process.stdout.write(`\r  Thumbnails: ${generated} generated, ${skipped} cached`);
        } catch (err) {
          console.error(`\n  Failed: ${imagePath}: ${err.message}`);
        }
      }),
    );
  }

  if (generated > 0 || skipped > 0) {
    console.log(`\n  Done: ${generated} generated, ${skipped} cached`);
  }
}

// --- Workspace activation ---

async function activateWorkspace(workspace) {
  activeImageRoot = workspace.path;
  activeThumbRoot = path.join(THUMB_BASE, workspace.id);

  console.log(`Activating workspace: ${workspace.name}`);
  console.log(`  Image root: ${activeImageRoot}`);

  console.log("  Building manifest...");
  activeManifest = buildManifest(activeImageRoot);

  const totalImages = activeManifest.groups.reduce(
    (sum, p) => sum + p.categories.reduce((s, c) => s + c.images.length, 0),
    0,
  );
  console.log(`  Found ${activeManifest.groups.length} groups, ${totalImages} images`);

  console.log("  Generating thumbnails...");
  await generateThumbnails(activeManifest, activeImageRoot, activeThumbRoot);

  imageMiddleware = express.static(activeImageRoot, {
    setHeaders(res) {
      res.set("Cache-Control", "public, max-age=3600");
    },
  });
  thumbMiddleware = express.static(activeThumbRoot, {
    setHeaders(res) {
      res.set("Cache-Control", "public, max-age=86400");
    },
  });
}

// --- Express setup ---

app.use(express.json());

const staticDir =
  process.env.NODE_ENV === "production"
    ? path.join(__dirname, "dist")
    : path.join(__dirname, "public");
app.use(express.static(staticDir));

// Dynamic static middleware wrappers
app.use("/images", (req, res, next) => imageMiddleware(req, res, next));
app.use("/thumbnails", (req, res, next) => thumbMiddleware(req, res, next));

// --- API: Manifest ---

app.get("/api/manifest", (_req, res) => {
  res.json(activeManifest);
});

// --- API: Workspaces ---

app.get("/api/workspaces", (_req, res) => {
  res.json(workspaceStore.list());
});

app.post("/api/workspaces", (req, res) => {
  const { name, path: dirPath } = req.body;
  if (!name || !dirPath) {
    return res.status(400).json({ error: "name and path are required" });
  }
  const result = workspaceStore.create(name, dirPath);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  res.status(201).json(result.workspace);
});

app.put("/api/workspaces/:id", (req, res) => {
  const result = workspaceStore.update(req.params.id, req.body);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result.workspace);
});

app.delete("/api/workspaces/:id", (req, res) => {
  const result = workspaceStore.remove(req.params.id);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ ok: true });
});

app.post("/api/workspaces/:id/activate", async (req, res) => {
  const result = workspaceStore.activate(req.params.id);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  await activateWorkspace(result.workspace);
  res.json({ workspace: result.workspace, manifest: activeManifest });
});

// --- API: Directory browser ---

app.get("/api/browse", (req, res) => {
  const os = require("os");
  const target = typeof req.query.path === "string" ? req.query.path : os.homedir();
  const resolved = path.resolve(target);

  let entries;
  try {
    entries = fs
      .readdirSync(resolved, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"))
      .map((d) => d.name);
  } catch {
    return res.status(400).json({ error: "Cannot read directory" });
  }

  res.json({
    current: resolved,
    parent: path.dirname(resolved) !== resolved ? path.dirname(resolved) : null,
    directories: entries,
  });
});

// --- Startup ---

async function main() {
  const workspace = workspaceStore.initialize();

  if (workspace) {
    await activateWorkspace(workspace);
  } else {
    console.log("No workspace configured. Use the UI to add one.");
  }

  app.listen(PORT, () => {
    console.log(`\nImage Switcher running at http://localhost:${PORT}`);
    console.log(`  Control Surface: http://localhost:${PORT}/`);
    console.log(`  Program Output:  http://localhost:${PORT}/program.html`);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
