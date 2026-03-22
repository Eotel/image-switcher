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
let activeManifest = { people: [] };
let imageMiddleware = (_req, _res, next) => next();
let thumbMiddleware = (_req, _res, next) => next();

// --- Manifest & thumbnail helpers (parameterized) ---

function buildManifest(imageRoot) {
  const people = [];

  let entries;
  try {
    entries = fs
      .readdirSync(imageRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  } catch {
    return { people: [] };
  }

  for (const personDir of entries) {
    const personPath = path.join(imageRoot, personDir.name);
    const categories = [];

    const catEntries = fs
      .readdirSync(personPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));

    for (const catDir of catEntries) {
      const catPath = path.join(personPath, catDir.name);
      const images = fs
        .readdirSync(catPath)
        .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
        .sort()
        .map((filename) => ({
          filename,
          path: `${personDir.name}/${catDir.name}/${filename}`,
        }));

      if (images.length > 0) {
        categories.push({ name: catDir.name, images });
      }
    }

    if (categories.length > 0) {
      people.push({
        name: personDir.name,
        index: people.length + 1,
        categories,
      });
    }
  }

  return { people };
}

async function generateThumbnails(manifest, imageRoot, thumbRoot) {
  const CONCURRENCY = 8;
  let generated = 0;
  let skipped = 0;

  const tasks = [];
  for (const person of manifest.people) {
    for (const category of person.categories) {
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

  const totalImages = activeManifest.people.reduce(
    (sum, p) => sum + p.categories.reduce((s, c) => s + c.images.length, 0),
    0,
  );
  console.log(`  Found ${activeManifest.people.length} people, ${totalImages} images`);

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
