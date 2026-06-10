# frame-screen-saver

A full-screen ambient display for a wall-mounted screen — cycling through photos while surfacing the things that actually matter: the clock, the weather, the next train, the week's calendar, and sunrise/sunset.

Built with Angular 21 (SSR), Express, and a handful of public APIs. Ships as a single Docker image.

---

## What it shows

The frame cycles between two views on a configurable timer:

| View | Content |
|---|---|
| **Cover** | Full-bleed photo from the media library, clock overlay |
| **Columns** | Weather · Transit departures · Calendar · Solar countdown |

Photos are served on-demand, resized and cached server-side via [Sharp](https://sharp.pixelplumbing.com/). The image set lives in `media/` and is baked into the container at build time.

---

## Architecture

```
┌─────────────────────────────────┐
│         Browser (Angular)       │  SSR hydration, GSAP crossfades
│  CoverPage ↔ ColumnsPage        │  keyboard shortcut: Space = pause
└────────────────┬────────────────┘
                 │ HTTP (SSR + API)
┌────────────────▼────────────────┐
│      Express server (Node)      │
│  /api/clock   /api/weather      │
│  /api/solar   /api/transit      │
│  /api/calendar /api/images      │
│  in-memory response caching     │
└────────────────┬────────────────┘
                 │
      met.no · Navitia / PRIM
      BKK / GTFS-RT · iCal
```

---

## Transit providers

Configure one in `src/server.config.ts`:

| Provider | Coverage | Env var |
|---|---|---|
| `navitia` | 40+ countries | `NAVITIA_TOKEN` |
| `prim` | Île-de-France | `PRIM_API_KEY` |
| `bkk` | Budapest | — |
| `gtfs-rt` | Generic GTFS-RT feed | — |

---

## Running locally

```bash
cd web
npm install
npm start          # serves on http://localhost:4500
```

Edit `src/server.config.ts` to set your timezone, coordinates, stop ID, and calendar URL.

---

## Docker

The image is built from the workspace root so the Dockerfile can reach both `web/` and `media/`.

```bash
# from containers/
docker compose up --build
```

The app is available on **http://localhost:4500**.

### What the build does

```
node:22-alpine  ──►  npm ci + ng build  ──►  dist/frame-screen-saver/
                                                       │
node:22-alpine  ──►  npm ci --omit=dev                 │
                     + dist/                  ◄─────────┘
                     + /media/  (baked in)
                     → node dist/.../server.mjs
```

The `media/` folder is copied into `/media/` inside the image and the `MEDIA_DIR` env var is set accordingly. No volume mount needed for photos.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Port the Express server listens on |
| `MEDIA_DIR` | `/media` | Path to the photo library root |
| `NAVITIA_TOKEN` | — | Required when `provider: 'navitia'` |
| `PRIM_API_KEY` | — | Required when `provider: 'prim'` |

---

## Media library layout

```
media/
  cities/
    paris-01.jpg
    paris-01.json       ← optional: { "title": "…", "subtitle": "…", "location": "…" }
  nature/
    alps-01.webp
  cache/                ← auto-generated, ignored by git
```

Supported formats: `jpg`, `jpeg`, `png`, `webp`.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Pause / resume the slide cycle |
| `→` | Skip to next image immediately |

---

## Project layout

```
web/          Angular app + Express SSR server
media/        Photo library (baked into the Docker image)
containers/   docker-compose.yml
```
