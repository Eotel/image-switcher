const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3456;

const IMAGE_ROOT = path.resolve(__dirname, '../★活動報告会用セレクト');
const THUMB_ROOT = path.resolve(__dirname, '.thumbnails');

function buildManifest() {
  const people = [];
  const entries = fs.readdirSync(IMAGE_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  for (const personDir of entries) {
    const personPath = path.join(IMAGE_ROOT, personDir.name);
    const categories = [];

    const catEntries = fs.readdirSync(personPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    for (const catDir of catEntries) {
      const catPath = path.join(personPath, catDir.name);
      const images = fs.readdirSync(catPath)
        .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
        .sort()
        .map(filename => ({
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

async function generateThumbnails(manifest) {
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

  // Ensure all directories exist upfront
  const dirs = new Set(tasks.map(p => path.dirname(path.join(THUMB_ROOT, p))));
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Process in batches for controlled concurrency
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async function (imagePath) {
      const destPath = path.join(THUMB_ROOT, imagePath);

      try {
        fs.accessSync(destPath);
        skipped++;
        return;
      } catch (_) {
        // File doesn't exist, generate it
      }

      try {
        await sharp(path.join(IMAGE_ROOT, imagePath))
          .resize(400, null, { withoutEnlargement: true })
          .jpeg({ quality: 60 })
          .toFile(destPath);
        generated++;
        process.stdout.write(`\r  Thumbnails: ${generated} generated, ${skipped} cached`);
      } catch (err) {
        console.error(`\n  Failed: ${imagePath}: ${err.message}`);
      }
    }));
  }

  console.log(`\n  Done: ${generated} generated, ${skipped} cached`);
}

async function main() {
  console.log('Building manifest...');
  const manifest = buildManifest();

  const totalImages = manifest.people.reduce(
    (sum, p) => sum + p.categories.reduce((s, c) => s + c.images.length, 0),
    0
  );
  console.log(`  Found ${manifest.people.length} people, ${totalImages} images`);

  console.log('Generating thumbnails...');
  await generateThumbnails(manifest);

  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/manifest', (_req, res) => {
    res.json(manifest);
  });

  app.use('/images', express.static(IMAGE_ROOT, {
    setHeaders(res) {
      res.set('Cache-Control', 'public, max-age=3600');
    },
  }));

  app.use('/thumbnails', express.static(THUMB_ROOT, {
    setHeaders(res) {
      res.set('Cache-Control', 'public, max-age=86400');
    },
  }));

  app.listen(PORT, () => {
    console.log(`\nImage Switcher running at http://localhost:${PORT}`);
    console.log(`  Control Surface: http://localhost:${PORT}/`);
    console.log(`  Program Output:  http://localhost:${PORT}/program.html`);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
