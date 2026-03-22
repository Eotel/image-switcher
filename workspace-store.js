const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CONFIG_PATH = path.resolve(__dirname, "workspaces.json");
const TEMPLATE_PATH = path.resolve(__dirname, "templates/sample-workspace");

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return { currentWorkspaceId: null, workspaces: [] };
  }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

function validatePath(dirPath) {
  const resolved = path.resolve(dirPath);
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { ok: false, error: "Path is not a directory" };
    }
    return { ok: true, resolved };
  } catch {
    return { ok: false, error: "Path does not exist" };
  }
}

function list() {
  const config = readConfig();
  return {
    currentWorkspaceId: config.currentWorkspaceId,
    workspaces: config.workspaces,
  };
}

function create(name, dirPath) {
  const validation = validatePath(dirPath);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const config = readConfig();
  const workspace = {
    id: crypto.randomUUID(),
    name: name.trim(),
    path: validation.resolved,
    createdAt: new Date().toISOString(),
  };

  config.workspaces.push(workspace);

  if (config.currentWorkspaceId === null) {
    config.currentWorkspaceId = workspace.id;
  }

  writeConfig(config);
  return { ok: true, workspace };
}

function update(id, fields) {
  const config = readConfig();
  const workspace = config.workspaces.find((w) => w.id === id);
  if (!workspace) {
    return { ok: false, error: "Workspace not found" };
  }

  if (fields.name !== undefined) {
    workspace.name = fields.name.trim();
  }

  if (fields.path !== undefined) {
    const validation = validatePath(fields.path);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }
    workspace.path = validation.resolved;
  }

  writeConfig(config);
  return { ok: true, workspace };
}

function remove(id) {
  const config = readConfig();
  const index = config.workspaces.findIndex((w) => w.id === id);
  if (index === -1) {
    return { ok: false, error: "Workspace not found" };
  }
  if (config.currentWorkspaceId === id) {
    return { ok: false, error: "Cannot delete the active workspace" };
  }

  config.workspaces.splice(index, 1);
  writeConfig(config);
  return { ok: true };
}

function activate(id) {
  const config = readConfig();
  const workspace = config.workspaces.find((w) => w.id === id);
  if (!workspace) {
    return { ok: false, error: "Workspace not found" };
  }

  const validation = validatePath(workspace.path);
  if (!validation.ok) {
    return { ok: false, error: `Workspace path no longer valid: ${validation.error}` };
  }

  config.currentWorkspaceId = id;
  writeConfig(config);
  return { ok: true, workspace };
}

function getActive() {
  const config = readConfig();
  if (!config.currentWorkspaceId) {
    return null;
  }
  return config.workspaces.find((w) => w.id === config.currentWorkspaceId) || null;
}

/**
 * Initialize on first run:
 * - If workspaces.json has no workspaces, create a default one
 *   pointing to the template directory.
 */
function initialize() {
  const config = readConfig();
  if (config.workspaces.length > 0) {
    return getActive();
  }

  if (fs.existsSync(TEMPLATE_PATH) && fs.statSync(TEMPLATE_PATH).isDirectory()) {
    const result = create("Sample Workspace", TEMPLATE_PATH);
    if (result.ok) {
      return result.workspace;
    }
  }

  return null;
}

module.exports = {
  list,
  create,
  update,
  remove,
  activate,
  getActive,
  initialize,
  CONFIG_PATH,
};
