# Architecture

## Overview

Express backend (CJS) + multi-page Vite frontend (TypeScript). No UI framework — vanilla TS/HTML/CSS.

```
Control Surface (index.html)  <--BroadcastChannel-->  Program Output (program.html)
        |
        v
   REST API  -->  Express server  -->  Filesystem (images, thumbnails)
```

## Pages

| URL             | Page            | Purpose                                           |
| --------------- | --------------- | ------------------------------------------------- |
| `/`             | Control Surface | Main operator UI with monitors and thumbnail grid |
| `/program.html` | Program Output  | Projection/broadcast display (separate window)    |
| `/about.html`   | About           | License and attribution information               |

## API Reference

### `GET /api/manifest`

Returns the image manifest for the active workspace.

```json
{
  "groups": [
    {
      "name": "Speaker A",
      "index": 1,
      "categories": [
        {
          "name": "Slides",
          "images": [{ "filename": "slide-1.webp", "path": "Speaker A/Slides/slide-1.webp" }]
        }
      ]
    }
  ]
}
```

### `GET /api/workspaces`

```json
{
  "currentWorkspaceId": "abc-123",
  "workspaces": [
    { "id": "abc-123", "name": "My Event", "path": "/path/to/images", "createdAt": "..." }
  ]
}
```

### `POST /api/workspaces`

Request: `{ "name": "My Event", "path": "/path/to/images" }`
Response: `201` with the created workspace object.

### `PUT /api/workspaces/:id`

Request: `{ "name": "New Name" }` (partial update)
Response: updated workspace object.

### `DELETE /api/workspaces/:id`

Response: `{ "ok": true }`. Cannot delete the active workspace (returns `400`).

### `POST /api/workspaces/:id/activate`

Activates the workspace: rebuilds manifest, generates thumbnails, swaps static middleware.
Response: `{ "workspace": {...}, "manifest": {...} }`

### `GET /api/browse?path=/some/dir`

Browse host filesystem directories for workspace setup.

```json
{
  "current": "/Users/me/images",
  "parent": "/Users/me",
  "directories": ["event-2026", "portraits"]
}
```

## BroadcastChannel Messages

Channel name: `"image-switcher"`. All messages include a `type` discriminant.

| Type                | Payload                                               | Description                       |
| ------------------- | ----------------------------------------------------- | --------------------------------- |
| `take`              | `{ imageUrl, transition: "cut"\|"auto", durationMs }` | Transition image to program       |
| `black`             | `{ transition: "cut", durationMs: 0 }`                | Black out program                 |
| `workspace-changed` | —                                                     | Workspace switched; reset display |

TypeScript types are defined in `public/js/channel.ts`:

```typescript
type TransitionType = "cut" | "auto";
type ChannelMessage =
  | { type: "take"; imageUrl: string; transition: TransitionType; durationMs: number }
  | { type: "black"; transition: TransitionType; durationMs: number }
  | { type: "workspace-changed" };
```

## Transition Implementation

Both control surface and program output use a **dual-layer crossfade** system:

- Two `<img>` layers (`imgA` / `imgB`) swap between active and inactive
- **CUT**: sets `--transition-duration: 0s`, swaps layers instantly
- **AUTO**: sets `--transition-duration` to the selected value, CSS handles the crossfade
- A generation counter prevents stale transitions from applying

## Static File Serving

| Route           | Source                                  | Cache-Control |
| --------------- | --------------------------------------- | ------------- |
| `/images/*`     | Active workspace image directory        | 1 hour        |
| `/thumbnails/*` | `.thumbnails/<workspace-id>/`           | 24 hours      |
| `/*`            | `public/` (dev) or `dist/` (production) | default       |

## Development

For commands and toolchain details, see [CLAUDE.md](../CLAUDE.md).

- **Dev mode**: Express on `:3456` + Vite on `:5173` (proxies API to Express)
- **Production**: `npm run build` then `npm run preview`
- **Type checking**: only `public/js/*.ts` — backend is plain CJS
- **Toolchain**: vite-plus (`vp`), not raw vite
