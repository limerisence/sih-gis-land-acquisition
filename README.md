# 🗺️ BhoomiAcquire GIS

**A GIS-powered land acquisition and infrastructure corridor impact analysis tool for West Bengal municipalities.**

Built for **Smart India Hackathon (SIH) 2026**.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-Map-199900?logo=leaflet&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white)

**Live demo:** [bhoomi-setu-gis.vercel.app](https://bhoomi-setu-gis.vercel.app)

---

## 📌 Overview

When a road, bridge, pipeline or any other linear infrastructure project is proposed, officials must find out **which land parcels and buildings will be affected** before acquisition can begin. Doing this by hand from paper records is slow and error-prone.

**BhoomiAcquire GIS** automates this. A user draws a corridor alignment on an interactive map (or pastes coordinates), chooses a corridor width, and the system instantly:

- Builds a buffered corridor polygon around the alignment
- Fetches live land-use and building data from OpenStreetMap
- Detects every land plot and building that intersects the corridor
- Reports affected area, corridor length and a surveyor-ready plot dossier

### 👥 Who it's for

| User | How they use it |
|---|---|
| **Municipal Officers** | Input corridor alignments and run impact analysis |
| **Surveyors** | Use the field dossier (address, GPS, Google Maps link) to locate plots |
| **District Collectors** | Review affected plots and area statistics |

---

## ✨ Features

- 📍 **Multi-point corridor drawing**: click the map to add any number of vertices (not limited to A → B)
- ⌨️ **Manual and bulk input**: enter lat/lng by hand, or paste JSON `[[lat, lng], ...]` or multi-line CSV
- 📏 **Adjustable corridor width**: presets of 15 / 20 / 30 / 50 / 100 m, or a custom value
- 🌐 **Live OpenStreetMap data** via the Overpass API, with an automatic **local fallback dataset** if it is unavailable
- 🧮 **Spatial analysis with Turf.js**: corridor length, buffer polygon, intersection detection, area calculation
- 🎨 **Colour-coded map**: affected plots in red, affected buildings in gold, unaffected plots in green, selected feature in orange, corridor buffer in blue
- 🗂️ **Surveyor field dossier**: tabbed list (Land Plots / Buildings / All) with search by plot ID, Khasra number, owner or address
- 🏠 **Reverse geocoding** with OSM Nominatim (rate-limited queue + in-memory cache)
- 🔍 **Feature inspection modal**: area in sq km, m² and hectares, land classification, OSM IDs
- 🛰️ **Multiple base maps**: OpenStreetMap, CartoDB Dark, Esri Satellite
- 📊 **Impact summary card**: corridor length, affected plot and building counts, total affected area
- 🔔 **Data provenance indicator**: shows whether live OSM data or fallback data is in use

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 8, Tailwind CSS v4 |
| **Mapping** | Leaflet, React-Leaflet |
| **Spatial analysis** | Turf.js (`@turf/turf` v7) |
| **Backend** | Node.js (18+), Express 4 (ESM) |
| **Data sources** | Overpass API (OSM), OSM Nominatim, `osmtogeojson` |
| **State management** | React Context (`GISContext`) |

---

## 📁 Project Structure

```
sih-gis-land-acquisition/
├── context.md                      # Detailed technical context
├── backend/
│   ├── server.js                   # Express API server (single ESM file)
│   ├── package.json
│   ├── .env                        # PORT, NODE_ENV
│   └── data/
│       └── plots.json              # Fallback GeoJSON of cadastral plots
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js              # Vite + Tailwind + /api proxy → :5000
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── context/
        │   └── GISContext.jsx      # Central state and actions
        ├── components/
        │   ├── MapContainer.jsx          # Leaflet map, layers, popups, camera
        │   ├── Sidebar.jsx               # Floating left panel
        │   ├── CoordinateInputPanel.jsx  # Manual / pasted coordinates, buffer width
        │   ├── FeatureList.jsx           # Tabbed surveyor dossier
        │   ├── FeatureItemCard.jsx       # Single plot/building card
        │   ├── FeatureDetailModal.jsx    # Full inspection modal
        │   └── ImpactSummaryCard.jsx     # Corridor statistics
        ├── services/
        │   └── reverseGeocode.js         # Nominatim queue + cache
        └── data/
            └── cadastralPlots.js         # Local fallback dataset
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **v18 or higher** (the backend uses the built-in `fetch`)
- npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/limerisence/sih-gis-land-acquisition.git
cd sih-gis-land-acquisition
```

### 2. Start the backend

```bash
cd backend
npm install
npm start          # or: npx nodemon server.js for auto-restart
```

The API runs at **http://localhost:5000**.

### 3. Start the frontend

Open a **second terminal**:

```bash
cd frontend
npm install
npm run dev
```

The app runs at **http://localhost:5173**. Vite proxies `/api/*` to `http://localhost:5000`, so no CORS setup is needed in development.

### 4. Try it out

1. Open http://localhost:5173
2. Click **Load Sample Route** (a sample alignment in central Kolkata), or click the map to place at least two points
3. Set the corridor width
4. Click **Calculate Corridor Impact**
5. Explore the affected plots on the map and in the sidebar

---

## ⚙️ Environment Variables

Create `backend/.env`:

```env
PORT=5000
NODE_ENV=development
```

---

## 🔌 API Reference

### `GET /api/health`

Checks that the backend is running.

```json
{ "status": "ok", "service": "...", "port": 5000, "timestamp": "..." }
```

### `GET /api/plots`

Returns the local fallback `plots.json` GeoJSON FeatureCollection.

### `POST /api/land/intersect`

Core spatial analysis endpoint.

**Request**

```json
{
  "points": [[22.5685, 88.3639], [22.5700, 88.3660]],
  "widthInMeters": 20
}
```

**Response (abridged)**

```json
{
  "bridgeBuffer": { "type": "Feature", "geometry": { "type": "Polygon" } },
  "affectedPlots": [],
  "allPlotsInArea": [],
  "summary": {
    "totalPlots": 12,
    "totalAreaSqM": 45000,
    "totalAreaSqKm": 0.045,
    "totalLengthKm": 0.432,
    "totalLengthMeters": 432
  },
  "source": "overpass",
  "bbox": { "south": 0, "west": 0, "north": 0, "east": 0 }
}
```

**How it works**

1. Validates and de-duplicates the input points
2. Builds a multi-segment `lineString` and measures its length
3. Computes a bounding box with 400 m padding around the corridor
4. Queries the Overpass API for `building` and `landuse` features in that box (primary and secondary mirrors), falling back to `plots.json` on failure
5. Converts OSM data to GeoJSON and **enriches** each feature (plot ID, Khasra number, owner, area, centroid, land category, address)
6. Buffers the centreline by `width / 2` metres
7. Runs `booleanIntersects` on every feature to find the affected ones
8. Returns the buffer, affected features and summary metrics

---

## 🔄 How Data Flows

```
Map click / pasted coordinates
        │
        ▼
GISContext.addPoint()  →  points[]
        │
        ▼
"Calculate Corridor Impact"
        │
        ▼
POST /api/land/intersect
        │   Overpass API → osmtogeojson → enrich → Turf buffer + intersect
        ▼
GISContext updates (affectedPlots, affectedBuildings, bridgeBuffer, summary)
        │
        ├──► Map: red/gold affected features + blue corridor
        └──► Sidebar: impact summary + surveyor dossier + reverse-geocoded addresses
```

---

## 🧭 Design Decisions

- **Graceful degradation**: live OSM data is primary, and the local `plots.json` is used automatically if Overpass fails. The UI always shows which source is active.
- **Multi-vertex corridors**: the whole pipeline supports N points, with no hard-coded start and end.
- **Single source of truth**: all spatial state lives in `GISContext`; components stay presentational.
- **No mock data in the UI**: owner fields show real OSM tags, and known placeholder strings are filtered out.
- **Polite API usage**: Nominatim requests are queued at 700 ms intervals and cached by coordinates (about 11 m precision).
- **Forced layer re-render**: version counters in the GeoJSON `key` props make Leaflet re-bind all popups and handlers when data changes.

---

## 🗺️ Roadmap

- [ ] PDF / CSV export of the affected plot list
- [ ] Acquisition notice generator (LARR Act Section 4 / 11 templates)
- [ ] Integration with a real ownership registry (WBLRS / DILRMP)
- [ ] Offline PWA mode for field surveyors
- [ ] Role-based login (Officer / Surveyor / Collector)
- [ ] Multi-corridor project management
- [ ] Free-form polygon intersection tool
- [ ] Mobile-responsive layout (sidebar as a bottom sheet)
- [ ] Unit tests (Vitest + React Testing Library)
- [ ] Production build and deployment pipeline

---

## 🔗 Services Used

| Service | Purpose |
|---|---|
| Overpass API (`overpass.kumi.systems`, `overpass-api.de`) | Live OSM building and land-use data |
| OSM Nominatim | Reverse geocoding of plot addresses |
| OpenStreetMap / CartoDB / Esri | Base map tiles |

> Please respect the usage policies of the OpenStreetMap services.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 👨‍💻 Team

<!-- Add your team members here -->
| Name | Role |
|---|---|
| _Your Name_ | _Role_ |

---

## 📄 License

<!-- Add a license of your choice, e.g. MIT -->
This project was built for Smart India Hackathon 2026.

---

## 🙏 Acknowledgements

- [OpenStreetMap](https://www.openstreetmap.org/) contributors
- [Turf.js](https://turfjs.org/)
- [Leaflet](https://leafletjs.com/) and [React-Leaflet](https://react-leaflet.js.org/)
- Smart India Hackathon 2026
