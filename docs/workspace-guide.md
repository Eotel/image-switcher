# Workspace Guide

A **workspace** points to a directory on your filesystem containing images. The directory structure determines how images are organized in the UI.

## Image Directory Structure

```
<group>/<category>/<filename>.{jpg,png,webp}
```

Three-level hierarchy:

| Level               | Maps to      | UI element             |
| ------------------- | ------------ | ---------------------- |
| Top-level directory | **Group**    | Tab bar (keys 1–5)     |
| Subdirectory        | **Category** | Section header in grid |
| File                | **Image**    | Thumbnail              |

### Example

```
my-event/
  Speaker A/
    Profile/
      portrait.webp       -> Group: "Speaker A", Category: "Profile"
    Slides/
      slide-1.webp         -> Group: "Speaker A", Category: "Slides"
      slide-2.webp
  Speaker B/
    Profile/
      portrait.webp        -> Group: "Speaker B", Category: "Profile"
    Slides/
      slide-1.webp         -> Group: "Speaker B", Category: "Slides"
```

This creates two group tabs ("Speaker A", "Speaker B"), each with "Profile" and "Slides" categories.

### Edge Cases

| Structure                    | Group  | Category    |
| ---------------------------- | ------ | ----------- |
| `image.jpg` (root)           | (All)  | (All)       |
| `GroupA/image.jpg`           | GroupA | (All)       |
| `GroupA/Sub1/Sub2/image.jpg` | GroupA | Sub1 / Sub2 |

### Sorting

All groups, categories, and filenames are sorted using **Japanese locale collation** (`ja`).

### Supported Formats

`.jpg`, `.jpeg`, `.png`, `.webp` (case-insensitive)

## Thumbnails

Thumbnails are auto-generated when a workspace is activated:

- **Size:** 400px wide (aspect ratio preserved)
- **Format:** JPEG, quality 60
- **Location:** `.thumbnails/<workspace-id>/` at the project root
- **Caching:** Existing thumbnails are not regenerated
- **Concurrency:** 8 images processed in parallel

## Managing Workspaces

### First Run

On first run (no `workspaces.json`), a **Sample Workspace** is auto-created pointing to `templates/sample-workspace/`.

### Adding a Workspace

1. Click the **gear icon** (⚙) next to the workspace dropdown
2. Enter a **name** and the **absolute path** to the image directory
3. Use the **Browse** button to navigate the filesystem visually
4. Click **Add**

### Switching Workspaces

Select from the dropdown in the toolbar. This triggers:

- Manifest rebuild (rescans directory structure)
- Thumbnail generation for any new images
- UI refresh (clears preview and program)
- Program output window is notified to reset

### Deleting a Workspace

Open the workspace management dialog and click **Delete** on any non-active workspace. The currently active workspace cannot be deleted.

### Storage

Workspace configuration is stored in `workspaces.json` at the project root:

```json
{
  "currentWorkspaceId": "<uuid>",
  "workspaces": [
    {
      "id": "<uuid>",
      "name": "My Event",
      "path": "/absolute/path/to/images",
      "createdAt": "2026-03-22T..."
    }
  ]
}
```
