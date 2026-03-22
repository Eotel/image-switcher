# Image Switcher

Broadcast-style preview/program image switcher for live events. Select images in the **Preview** monitor, then transition to the **Program** output with **CUT** (instant) or **AUTO** (crossfade).

## Features

- **Preview/Program** dual-monitor paradigm (like broadcast video switchers)
- **CUT / AUTO transitions** — instant cut or crossfade with configurable duration
- **Keyboard-driven** operation for live event speed
- **Multi-window** — control surface + separate program output window for projection
- **Workspace system** for managing multiple image libraries
- **Auto-generated thumbnails** via sharp
- **Grid/List view** with adjustable thumbnail sizes
- **Horizontal/Vertical layout** toggle
- **Resizable panes** — drag to resize monitors and grid areas
- **Preferences persisted** in localStorage

## Quick Start

**Prerequisites:** Node.js (v18+), npm

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. On first run, a sample workspace is created automatically.

## How It Works

### Control Surface (main window)

The main window has two monitors on the left (or top) and a thumbnail grid on the right (or bottom).

1. **Click a thumbnail** to load it in the **PREVIEW** monitor
2. Press **Space** for **CUT** (instant switch) or **Enter** for **AUTO** (crossfade) to promote it to **PROGRAM**
3. Press **B** to **BLACK** out the program output

Double-clicking a thumbnail previews and immediately CUTs to program.

### CUT vs AUTO

| Transition | Key   | Behavior                                                       |
| ---------- | ----- | -------------------------------------------------------------- |
| **CUT**    | Space | Instant switch — no animation                                  |
| **AUTO**   | Enter | Crossfade — duration selectable (0.5s, 1.0s, 1.5s, 2.0s, 3.0s) |

The AUTO duration is selectable from the dropdown next to the AUTO button. Default is **1.0s**. The selected duration is saved across sessions.

### Program Output (separate window)

Click **Open PGM** to open a dedicated program output window. This window:

- Receives images from the control surface via BroadcastChannel
- Supports the same CUT/AUTO transitions
- Can be fullscreened by clicking the overlay
- Designed for projector or broadcast output

### Group Tabs

Images are organized into groups based on the top-level directory structure.

- **ALL** (key: **0**) shows all images
- Keys **1**–**5** select specific groups
- Tabs scroll horizontally when there are many groups

## Keyboard Shortcuts

| Key            | Action                                 |
| -------------- | -------------------------------------- |
| **Space**      | CUT — instant transition to program    |
| **Enter**      | AUTO — crossfade transition to program |
| **B**          | BLACK — clear program output           |
| **L**          | Toggle layout (horizontal / vertical)  |
| **Esc**        | Clear preview selection                |
| **0**          | Show ALL groups                        |
| **1**–**5**    | Select group by number                 |
| **Arrow keys** | Navigate thumbnails                    |

## View Options

- **Grid / List** toggle (toolbar icons)
- **Thumbnail size** slider (80–240px, grid mode only, default 120px)
- **Horizontal / Vertical** layout (L key or toolbar button)
- **AUTO duration** selector (0.5s–3.0s)
- All pane borders are **resizable** by dragging

All preferences are saved to localStorage automatically.

## Further Reading

- [Workspace Guide](workspace-guide.md) — setting up image directories
- [Architecture](architecture.md) — API reference and technical details
- [CLAUDE.md](../CLAUDE.md) — development commands and project structure
