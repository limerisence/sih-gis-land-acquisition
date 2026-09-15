# BhoomiAcquire GIS — Project Context

> **Purpose of this file:** Complete technical context for a new AI model or developer to understand what has been built, every file's role, all design decisions, and what to build next — without needing to read every line of source code.

---

## 1. Project Identity

| Field | Value |
|---|---|
| **Name** | BhoomiAcquire GIS |
| **Competition** | Smart India Hackathon (SIH) 2024 |
| **Domain** | West Bengal Municipal Land Acquisition & Infrastructure Corridor Analysis |
| **Primary Users** | Municipal Officers (input), Surveyors (field dossier), District Collectors (review) |
| **Stack** | React 19 + Vite 8 (frontend) · Node.js + Express (backend) · Leaflet + React-Leaflet (map) · Turf.js (spatial) · Overpass API (live OSM data) |
| **Root** | `d:/sih-land-acquisition/` |

---

## 2. Repository Structure

```
sih-land-acquisition/
├── context.md                  ← THIS FILE
├── .gitignore
├── backend/
│   ├── server.js               ← Main Express API server (ESM, single file)
│   ├── package.json
│   ├── .env                    ← PORT (default 5000), NODE_ENV
│   └── data/
│       └── plots.json          ← Local fallback GeoJSON FeatureCollection of cadastral plots
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js          ← Vite + Tailwind CSS v4 + proxy /api → :5000
    └── src/
        ├── main.jsx            ← React root mount
        ├── App.jsx             ← Thin shell: GISProvider wrapping AppContent
        ├── App.css
        ├── index.css           ← Global CSS: Tailwind v4 import, Leaflet CSS, custom scrollbars, popup styles, pulse animation
        ├── context/
        │   └── GISContext.jsx  ← Single source of truth for ALL app state
        ├── components/
        │   ├── MapContainer.jsx        ← Leaflet map, layers, markers, popups, camera
        │   ├── Sidebar.jsx             ← Left floating panel shell (scrollable)
        │   ├── CoordinateInputPanel.jsx← Manual lat/lng entry, paste JSON/CSV, buffer slider, calculate button
        │   ├── FeatureList.jsx         ← Tabbed list: Land Plots | Buildings | All
        │   ├── FeatureItemCard.jsx     ← Single plot/building card with Nominatim reverse geocoding
        │   ├── FeatureDetailModal.jsx  ← Full-screen inspection modal for cadastral metadata
        │   └── ImpactSummaryCard.jsx   ← Corridor stats: length, affected count, area sq km/ha
        ├── services/
        │   └── reverseGeocode.js       ← OSM Nominatim queue + in-memory cache
        ├── data/
        │   └── cadastralPlots.js       ← Local fallback dataset used before backend connects
        └── assets/
```

---

## 3. How to Run

### Backend
```bash
cd d:/sih-land-acquisition/backend
node server.js         # production
# OR
npx nodemon server.js  # dev with auto-restart
```
Runs on **http://localhost:5000**

### Frontend
```bash
cd d:/sih-land-acquisition/frontend
npm run dev
```
Runs on **http://localhost:5173**
Vite proxies `/api/*` → `http://localhost:5000` so no CORS issues in dev.

---

## 4. Backend — `backend/server.js`

Single ESM file, ~419 lines. Uses Node's built-in `fetch` (Node 18+).

### Dependencies
```json
"@turf/turf": "^7.4.0",
"cors": "^2.8.5",
"dotenv": "^16.4.7",
"express": "^4.21.2",
"osmtogeojson": "^3.0.0-beta.5"
```

### API Endpoints

#### `GET /api/health`
Returns `{ status, service, port, timestamp }`. Used to confirm backend is alive.

#### `GET /api/plots`
Returns the full local fallback `plots.json` GeoJSON FeatureCollection.
Frontend calls this on mount to verify backend connectivity and pre-load the plot layer.

#### `POST /api/land/intersect`
**The core spatial analysis endpoint.**

**Request body:**
```json
{
  "points": [[lat1, lng1], [lat2, lng2], ...],
  "widthInMeters": 20
}
```

**What it does (step by step):**
1. Validates `points` array (min 2, numeric, deduplicates consecutive identical points).
2. Converts `[lat, lng]` → `[lng, lat]` for Turf.js coordinate order.
3. Builds a `turf.lineString()` from all points (multi-segment polyline).
4. Computes `totalLengthKm` and `totalLengthMeters` using `turf.length()`.
5. Creates a 400m padding bounding box around the corridor via `turf.buffer()` + `turf.bbox()`.
6. Calls **Overpass API** (tries `overpass.kumi.systems` POST first, then `overpass-api.de` GET) with a query for all `building` and `landuse` ways/relations inside the bbox.
7. Converts OSM JSON → GeoJSON via `osmtogeojson`, filters to Polygon/MultiPolygon only.
8. If Overpass fails or returns 0 features → falls back to `data/plots.json`.
9. **Enriches** all features via `enrichOsmFeatures()`:
   - Assigns `plotId` (e.g. `WB-PL-12345`), `khasraNo`, `ownerName` from real OSM tags
   - Computes `landAreaSqM` via `turf.area()`, `landAreaSqKm`
   - Computes centroid `coordinates: { lat, lng }` for surveyor navigation
   - Determines `landCategory` (Residential / Commercial / Agricultural) from OSM tags
   - Assigns `ratePerSqM` (West Bengal circle rate bands, deterministic hash-based)
   - Extracts real address from `addr:*` OSM tags
10. Creates the corridor buffer: `turf.buffer(line, width/2, { units: 'meters' })`.
11. Runs `turf.booleanIntersects(plot, bridgeBuffer)` for every plot.
12. Computes summary metrics.

**Response:**
```json
{
  "bridgeBuffer": { "GeoJSON Polygon": "..." },
  "affectedPlots": ["...enriched GeoJSON features"],
  "summary": {
    "totalPlots": 12,
    "totalAreaSqM": 45000,
    "totalAreaSqKm": 0.04500,
    "totalEstimatedCost": 540000000,
    "totalLengthKm": 0.432,
    "totalLengthMeters": 432
  },
  "totalLengthKm": 0.432,
  "totalLengthMeters": 432,
  "allPlotsInArea": ["...all enriched features in bbox"],
  "source": "overpass",
  "bbox": { "south": "...", "west": "...", "north": "...", "east": "..." }
}
```

---

## 5. Frontend Architecture

### 5a. `GISContext.jsx` — Central State Manager

**All state lives here.** Components never manage their own spatial state.

**Key state variables:**

| Variable | Type | Description |
|---|---|---|
| `allFeatures` | Feature[] | All OSM features in view (land + buildings); initially from fallback |
| `points` | `{lat, lng}[]` | User-placed corridor vertices (multi-point polyline) |
| `bufferWidthMeters` | number | Corridor half-width for Turf buffer (default: 20m) |
| `bridgeBuffer` | GeoJSON | The corridor polygon returned by backend |
| `affectedPlots` | Feature[] | Land parcel features intersecting corridor |
| `affectedBuildings` | Feature[] | Building footprint features intersecting corridor |
| `affectedPlotIds` | Set\<string\> | Memoized Set of `plotId`s for O(1) lookup in map styling |
| `affectedBuildingIds` | Set\<string\> | Same for buildings |
| `summary` | object | `{ totalPlots, totalAreaSqM, totalAreaSqKm, totalEstimatedCost, totalLengthKm }` |
| `isCalculated` | boolean | True after a successful `runAnalysis()` call |
| `isLoading` | boolean | True while awaiting backend response |
| `loadingStage` | string | Human-readable stage text shown in the Calculate button |
| `selectedFeature` | `{feature, kind}` | Currently inspected/focused feature |
| `mapFocusTarget` | `{lat, lng, plotId, zoom, timestamp}` | Triggers `flyTo` in MapContainer |
| `isModalOpen` | boolean | Controls FeatureDetailModal visibility |
| `notification` | `{message, type}` | Toast notification (auto-clears after 4.5s) |
| `resetCount` | number | Incremented on full reset to trigger map camera reset |
| `landVersion` / `buildingVersion` | number | Incremented to force GeoJSON layer re-render |
| `backendOnline` | boolean | Whether backend responded successfully |
| `dataSource` | `'overpass'` \| `'fallback'` \| null | Shows data provenance in UI |

**Key actions exposed in context:**

| Action | Description |
|---|---|
| `addPoint(latlng)` | Appends `{lat, lng}` to `points` array; shows toast |
| `removePoint(index)` | Removes point by index; clears results |
| `removeLastPoint()` | Pops last point; clears results |
| `clearPoints()` | Empties all points; clears results |
| `setPoints(pts[])` | Bulk-sets validated points (used by paste import) |
| `runAnalysis(pts?, width?)` | POSTs to `/api/land/intersect`, updates all result state |
| `loadSampleRoute()` | Loads a 3-point sample alignment in Central Kolkata (22.5685°N) and runs analysis |
| `resetAll()` | Full state reset back to initial |
| `inspectFeature(feature, kind)` | Opens the FeatureDetailModal with selected feature |
| `focusOnFeature(feature, kind, zoom)` | Sets `selectedFeature` + `mapFocusTarget` → triggers map flyTo |
| `showToast(message, type)` | Shows a floating notification (types: 'info', 'success', 'error') |

**Helper exports from GISContext:**
- `isBuilding(f)` — `Boolean(f?.properties?.buildingType)`
- `isLandPlot(f)` — `!isBuilding(f)`
- `formatINR(n)` — Formats number to `₹X Cr` / `₹X L` / `₹X` (Indian numbering)
- `BACKEND_URL` — `'http://localhost:5000'`

---

### 5b. `MapContainer.jsx` — Leaflet Map

Renders inside a `<div className="flex-1 relative w-full h-full">`. All map content is declarative React-Leaflet.

**Layer stack (bottom → top):**
1. **BaseLayers** (LayersControl): OpenStreetMap · CartoDB Dark · Esri Satellite
2. **GeoJSON: Land Plots** — key includes `landVersion + affectedPlots.length + selectedFeature` to force re-render on state change
3. **Polyline** — dashed blue line connecting all `points` vertices
4. **GeoJSON: Corridor Buffer** — semi-transparent blue polygon from backend
5. **GeoJSON: Buildings** — keyed same as land layer
6. **Markers** — `P1`, `P2`, ... `Pn` vertex markers with delete-vertex popups

**Style logic:**
- Land plots: unaffected=green, affected=red, selected=orange
- Buildings: unaffected=grey, affected=yellow/gold, selected=orange
- Determined by checking `affectedPlotIds.has(pid)` and `selectedFeature?.feature?.properties?.plotId === pid`

**`createPopupHtml(feature, affected, kind)`:**
Generates synchronized dark-themed HTML popup matching what the sidebar card shows:
- Plot ID (monospace, colored by affected status), Khasra number
- Surveyor address (from `addr:full`, cached Nominatim result, or coordinate fallback)
- GPS coordinates + Google Maps link
- Area in sq km
- "AFFECTED LAND PARCEL" badge if affected

**`MapClickHandler`:** A `useMapEvents` hook component that calls `addPoint(latlng)` on every map click.

**`MapCameraController`:** A `useMap` hook component that:
- `flyTo([lat, lng], zoom)` when `mapFocusTarget` changes (triggered by sidebar card click)
- Opens the matching plot's Leaflet popup 450ms after flyTo starts (via `layerRefs` registry)
- Resets camera to Kolkata center `[22.5726, 88.3639]` zoom 14 on `resetCount` increment

**`layerRefs`:** A `useRef({})` map of `plotId → Leaflet layer` populated in `onEachFeature` callbacks, enabling programmatic popup control.

---

### 5c. `Sidebar.jsx` — Left Floating Panel

Fixed-position left sidebar (`absolute top-4 left-4 z-20`), glassmorphism style.
Uses `overflow-y-auto` on its body div for full scrollability.

**Sections (top → bottom, all scrollable together):**
1. Header with title + Reset button
2. Data source banner (Live OSM / Fallback indicator)
3. `<CoordinateInputPanel />` — input controls
4. `<ImpactSummaryCard />` — only renders when `summary` is non-null
5. `<FeatureList />` — the main scrollable feature dossier

---

### 5d. `CoordinateInputPanel.jsx` — Input Controls

- **Points counter badge** (`N Points`)
- **Toolbar**: Remove Last Point · Paste Coordinates drawer toggle · Clear All
- **Paste Coordinates drawer** (collapsible): accepts JSON `[[lat, lng], ...]` or multi-line CSV; parses and calls `setPoints()`
- **Points list**: scrollable `max-h-36` list of placed vertices with individual delete buttons
- **Manual entry form**: Latitude input + Longitude input + **"Add Pin to Map" button** (below the inputs, form submit)
- **Buffer width control**: numeric input + preset buttons (15m / 20m / 30m / 50m / 100m)
- **Calculate button**: disabled until `points.length >= 2`; shows `loadingStage` text while loading

---

### 5e. `FeatureList.jsx` — Surveyor Field Dossier

**Tabs:** Land Plots (red) · Buildings (yellow) · All (blue, only after calculation)

- Before calculation: shows **all** `allFeatures` split by type
- After calculation: shows only the **affected** subset (same arrays used by the map)
- **Surveyor header bar**: total area (sq km) and item count for active tab
- **Search bar**: filters by plotId, khasraNo, ownerName, or address
- **Empty state**: green checkmark "No features intersect this corridor"

---

### 5f. `FeatureItemCard.jsx` — Single Feature Card

Clicking the card calls `focusOnFeature()` → map flies to the plot.

**Data shown:**
- Plot ID (red/yellow if affected), Khasra number, Land category badge, "Bldg" badge, "HIT" badge
- **Eye button** → opens `FeatureDetailModal`
- **Address row**: OSM `addr:full` → Nominatim cache → constructed addr → coordinate fallback
- **GPS row**: `lat, lng` + Google Maps "Survey Map" link
- **Area row**: `X.XXXXXX sq km` + `(N m²)`

**Nominatim integration**: On mount, calls `requestReverseGeocode(lat, lng, callback)` which queues and resolves the address asynchronously, then calls `setAddress()` to update the display.

**Important**: `realOwner` field explicitly filters out known mock strings (`"Swapan Halder & Sons"`, strings starting with `"Premises"`). No hardcoded mock data anywhere in the frontend.

---

### 5g. `FeatureDetailModal.jsx` — Inspection Modal

Full-screen overlay (`fixed inset-0 z-50`). Opened by the Eye button on any card or double-clicking a map polygon.

**Shows:**
- Plot ID + Khasra + Affected/Clear badge
- Surveyor Field Location: address + GPS + Google Maps link
- Affected Surface Area: sq km, m², Hectares
- Details table: Feature Type, Registered Title/Owner, Land Classification, OSM Feature ID, OSM Landuse Tag

---

### 5h. `ImpactSummaryCard.jsx` — Impact Statistics

Only renders when `summary !== null` (after a successful analysis run).
**Cost estimation is intentionally omitted** (was discarded at user request).

**Shows:**
- "N Total Features Hit" badge
- Corridor Alignment: length in km and meters + buffer width
- Land Plots count vs Buildings count (2-column grid)
- Total affected area in sq km (4 decimal places) and m² / Hectares

---

### 5i. `reverseGeocode.js` — Nominatim Service

Singleton module (not a React hook) with in-memory cache + sequential request queue.

**Exports:**
- `requestReverseGeocode(lat, lng, callback)` — checks cache first, then queues and resolves asynchronously
- `getCachedAddress(lat, lng)` — synchronous cache lookup (used by MapContainer popup generator)

**Queue behavior:**
- Requests processed one at a time with 700ms delay between them (respects OSM usage policy)
- Cache key is `"lat.4dec,lng.4dec"` (4 decimal places ≈ 11m precision)
- Multiple components watching the same coordinates share a single listener set

**Nominatim URL:**
`https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&zoom=18&addressdetails=1`

**Address formatting priority:**
1. `road + suburb + city + postcode`
2. `road + city + postcode`
3. `suburb + city + postcode`
4. First 4 segments of `display_name`
5. `"Plot at {lat}°N, {lng}°E"` coordinate fallback

---

## 6. Styling System

- **CSS framework**: Tailwind CSS v4 (via `@tailwindcss/vite` plugin, imported as `@import "tailwindcss"`)
- **Color palette** (dark theme):
  - Background: `slate-950` (`#030712`), panels: `slate-900`
  - Accent green: `emerald-400/500` (`#10b981`, `#059669`)
  - Affected plots: `#FF4136` (red)
  - Affected buildings: `#FFD700` (gold/yellow)
  - Corridor buffer: `#3b82f6` (blue)
  - Borders: `slate-700/800`
- **Fonts**: `Inter` (body) + `Outfit` (headings) via system fallback
- **Glassmorphism**: `bg-slate-900/95 backdrop-blur-md` on sidebar/header
- **Custom CSS** in `index.css`:
  - Leaflet popup dark theme override
  - `.point-marker-pin` with `::after` pulse-ring animation
  - Custom thin scrollbars (5px, slate colors)

---

## 7. Data Flow

```
User clicks map
      │
      ▼
MapClickHandler.onMapClick(latlng)
      │
      ▼
GISContext.addPoint({lat, lng})   ──→  points[] state updated
      │
      ▼
User clicks "Calculate N-Point Corridor Impact"
      │
      ▼
GISContext.runAnalysis()
      │
      ├── POST /api/land/intersect  {points: [[lat,lng]...], widthInMeters}
      │         │
      │         ▼
      │   backend/server.js
      │     1. Validate & deduplicate points
      │     2. turf.lineString() + turf.length()
      │     3. turf.bbox() of padded corridor
      │     4. Overpass API → osmtogeojson → enrichOsmFeatures()
      │        (or fallback to plots.json)
      │     5. turf.buffer(line, width/2, {units:'meters'})
      │     6. turf.booleanIntersects() on every plot
      │     7. Return { bridgeBuffer, affectedPlots, allPlotsInArea, summary, source }
      │
      ▼
GISContext updates:
  - allFeatures ← allPlotsInArea
  - affectedPlots ← affected land plots
  - affectedBuildings ← affected buildings
  - bridgeBuffer ← corridor polygon
  - summary ← metrics object
  - isCalculated ← true

      │
      ▼  (all consumers react via useGIS() hook)
MapContainer re-renders:
  - GeoJSON layers get new key → re-bind all popups
  - Affected plots turn RED, buildings turn YELLOW
  - Blue corridor polygon appears

Sidebar re-renders:
  - ImpactSummaryCard appears with metrics
  - FeatureList switches to showing only affected features
  - FeatureItemCard components fire requestReverseGeocode() for each

User clicks a FeatureItemCard
      │
      ▼
GISContext.focusOnFeature(feature, kind, 17)
  - sets selectedFeature → map re-renders polygon as ORANGE (selected)
  - sets mapFocusTarget { lat, lng, plotId, zoom, timestamp }

MapCameraController detects mapFocusTarget change
  - map.flyTo([lat, lng], 17)
  - setTimeout 450ms → layerRefs[plotId].openPopup()
```

---

## 8. Key Design Decisions & Constraints

1. **No hardcoded mock data in frontend cards.** The `realOwner` field in `FeatureItemCard` explicitly filters out known bad mock strings.

2. **Cost estimation was intentionally removed.** `ImpactSummaryCard` only shows area metrics. Backend still computes `totalEstimatedCost` and `ratePerSqM` (available for future re-use).

3. **Multi-point polyline, not just A→B.** The system — backend Overpass bbox, turf.lineString, turf.buffer, frontend points array — supports N vertices with no hardcoded "Point A / Point B" limitation.

4. **Overpass API is primary; local `plots.json` is fallback.** System degrades gracefully. `dataSource` in context/response makes this transparent to the user.

5. **GeoJSON layer keys force re-render.** The `key` prop on React-Leaflet `GeoJSON` includes version counters and selection state so Leaflet re-mounts and re-binds all event handlers whenever data changes.

6. **Sidebar is `absolute` positioned over the map**, not a flex sibling. `z-20` ensures it floats above Leaflet (`z-index: 1`).

7. **Nominatim requests are rate-limited.** The queue enforces ≥700ms between requests. Multiple components watching the same coordinates share a single listener, not multiple parallel fetches.

8. **`formatINR` is exported from GISContext**, not a standalone utility, because it is consumed by many components already importing the context hook.

9. **`landVersion` / `buildingVersion` / `bufferVersion` counters** are incremented whenever the corresponding data changes, acting as cache-busting keys for React-Leaflet's GeoJSON component.

---

## 9. What Has NOT Been Built Yet (Future Work)

- [ ] **Export / Report Generation**: PDF or CSV of affected plot list for surveyors and district collectors
- [ ] **Acquisition Notice Generator**: Auto-populate Section 4 / Section 11 LARR Act notice templates with Khasra data
- [ ] **Ownership Database Integration**: Link plotId to an actual WBLS / DILRMP ownership registry
- [ ] **Offline PWA mode**: Cache OSM tiles and local dataset for field surveyors without internet
- [ ] **User Auth / Role-based Access**: Officer login, Surveyor login, Collector login with separate views
- [ ] **Phase 2 — Multi-corridor Projects**: Managing multiple named corridor alignments within a single project
- [ ] **Measurement Sketch Tool**: Draw arbitrary polygon on map and compute intersections (not just linear corridors)
- [ ] **Mobile responsive layout**: Sidebar collapses to bottom sheet on small screens
- [ ] **Unit tests**: No test suite exists; Vitest + React Testing Library would be appropriate
- [ ] **Deployment**: No production build pipeline; currently only works locally

---

## 10. Environment & Port Summary

| Service | URL | Notes |
|---|---|---|
| Frontend dev server | `http://localhost:5173` | `npm run dev` in `frontend/` |
| Backend API | `http://localhost:5000` | `node server.js` in `backend/` |
| Vite API proxy | `/api/*` → `:5000` | Configured in `vite.config.js` |
| Overpass API (primary) | `https://overpass.kumi.systems/api/interpreter` | POST |
| Overpass API (fallback) | `https://overpass-api.de/api/interpreter` | GET |
| Nominatim Reverse Geocode | `https://nominatim.openstreetmap.org/reverse` | GET, rate-limited to 1 req/700ms |

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **Corridor** | The linear infrastructure alignment (road, pipeline, etc.) being proposed |
| **Buffer** | The polygon created by expanding the corridor centerline by `widthInMeters/2` on each side |
| **Khasra / Dag** | Traditional Indian cadastral plot identifier from revenue records |
| **Affected plot** | A land parcel or building whose geometry intersects the corridor buffer polygon |
| **allPlotsInArea** | All OSM features returned within the corridor's bounding box (superset of affected) |
| **enrichOsmFeatures()** | Backend function that maps raw OSM properties to the standardized schema (`plotId`, `landCategory`, `ratePerSqM`, etc.) |
| **flyTo** | Leaflet's animated camera pan+zoom to a coordinate |
| **layerRefs** | React ref dict mapping `plotId → Leaflet layer` for programmatic popup opening |
| **dataSource** | `"overpass"` = live OSM data used; `"fallback"` = local `plots.json` used |
