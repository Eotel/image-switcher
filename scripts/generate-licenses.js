#!/usr/bin/env node

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'licenses.json');

// Get license list from license-report (production deps only)
const reportRaw = execFileSync(
  'npx',
  ['license-report', '--output=json', '--fields=name', '--fields=installedVersion', '--fields=licenseType', '--fields=author', '--only=prod'],
  { cwd: ROOT, encoding: 'utf8' }
);
const report = JSON.parse(reportRaw);

// Enrich with license file text from node_modules
const dependencies = report.map(dep => {
  const pkgDir = path.join(ROOT, 'node_modules', dep.name);
  let licenseText = '';
  try {
    const files = fs.readdirSync(pkgDir).filter(f => /^licen[cs]e/i.test(f));
    if (files.length > 0) {
      licenseText = fs.readFileSync(path.join(pkgDir, files[0]), 'utf8');
    }
  } catch (_) { /* no license file */ }

  return {
    name: dep.name,
    version: dep.installedVersion,
    license: dep.licenseType,
    author: dep.author,
    licenseText,
  };
});

// App info
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
let appLicenseText = '';
try {
  appLicenseText = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
} catch (_) { /* no license file */ }

const result = {
  app: {
    name: pkg.name,
    version: pkg.version,
    license: pkg.license || 'Unknown',
    licenseText: appLicenseText,
  },
  dependencies,
};

fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`Generated ${OUT} (${dependencies.length} dependencies)`);
