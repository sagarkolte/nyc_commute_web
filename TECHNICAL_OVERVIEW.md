# NYC Commute App - Technical Overview

## 1. Project Goal
A high-aesthetic, minimalist real-time transit dashboard for the NYC Metro area.
**Core Value**: Instant visibility of "next departure" for user-selected commutes without navigation fatigue.

## 2. Architecture
- **Framework**: Next.js 15 (App Router).
- **Styling**: Vanilla CSS (Global styles) with `framer-motion` for polished interactions (drag-and-drop, swipes).
- **State Management**: React State + `CommuteStorage` (LocalStorage wrapper) for persisting user cards.
- **Backend API**: Next.js Serverless Routes (`/api/mta/...`, `/api/njt/...`) act as proxies to fetch and normalize data from various transit agencies, handling CORS and API keys securely.

## 3. Data Sources & Integration Strategy

### A. MTA Subway & Staten Island Railway (SIR)
- **Source**: MTA GTFS-Realtime Feeds.
- **Feed Logic**:
    - Uses standard numbered feeds (e.g., `.../gtfs`, `.../gtfs-ace`).
    - **SIR** is explicitly handled via the Subway `SI` feed (or fallback logic in main subway feed).
- **Alerts**: Fetched from `camsys%2Fsubway-alerts`.

### B. MTA Bus
- **Source**: Mixed Hybrid.
    - **Static Data**: Local JSON indices (`mta_bus_index.json`, `mta_bus_stops.json`) provide instant search and stop locations without an external API call for metadata.
    - **Real-time**: GTFS-Realtime (Custom extension or standard FeedMessage) fetched via `fetchBusGtfs`.
- **Alerts**: Fetched from `camsys%2Fbus-alerts`.

### C. Metro-North (MNR) & LIRR
- **Source**: MTA GTFS-Realtime Feeds (Protobuf / JSON).
- **Stations**: Hardcoded JSON lists (`mnr_stations.json`, `lirr_stations.json`) created from standard GTFS `stops.txt`.
- **Logic**: Directions are strictly "North/South" or "East/West" mapped to API direction IDs.
- **Alerts**: Specific feeds for `mnr` and `lirr`.

### D. NJ Transit (Rail & Bus)
- **Rail**:
    - **Real-time**: Official NJT API (requires Token).
    - **Fallback**: **SQLite Database** (`njt_schedule.db`) bundled in `src/lib`. If the API fails or rate-limits (common issue), the app falls back to querying the static schedule for "Scheduled" times.
- **Bus (V2)**:
    - Uses a scraped/proxy API structure for routes and stops.

### E. PATH
- **Source**: `https://path.transitdata.nyc/gtfsrt`.
- **Logic**: Sparse feed. Implementation includes heuristic logic to infer "Terminal Departures" when the feed only reports the *next* stop.

### F. NYC Ferry
- **Source**: Connexionz GTFS-RT (`.../tripupdate`).
- **Logic**:
    - **Schedule**: Local constants (`ferry_schedule.ts`) provide robust baseline.
    - **Real-time**: Connexionz feed is merged with the schedule. If a boat is live, the schedule slot becomes "Live".
- **Alerts**: Connexionz Alert feed.

## 4. Key Design Decisions

### "Countdown Card" Model
- The UI is card-based. Each card represents a **Directional Commute** (e.g., "Grand Central to Home").
- Cards are strictly ordered by the user (Drag & Drop with `framer-motion`).
- **UX**: Drag handle is on the **Left Edge** to prevent mobile cramping.

### Data Normalization
- All raw API data is normalized into a `CommuteArrival` interface:
    ```typescript
    {
        time: number; // Unix timestamp
        minutesUntil: number;
        destination: string;
        track?: string;
        status?: string; // "Live" | "Scheduled"
    }
    ```
- This allows a unified frontend component (`CountdownCard`) to render any mode identically.

### Robustness Over Accuracy
- **Aggressive Caching**: `CommuteStorage` persists user config.
- **Fallbacks**: NJT Schedule DB, Ferry Schedule constants, "Terminal Departure" inference for PATH. The app prefers showing *scheduled* data labeled as such rather than a blank error screen.

## 5. Mobile Deployment Considerations (Next Step)
- The app is currently a PWA-ready Web App.
- **Intention**: Deploy to App Store (iOS) and Play Store (Android).
- **Path**: Likely **Capacitor** integration to wrap the existing Next.js export, or **React Native** rewrite if native performance is critical. Given the heavy use of DOM-based animation (`framer-motion`), a wrapper (Capacitor) is the fastest route, but verify performance on low-end devices.

## 6. Access & Keys
- **MTA**: API Keys handled in `src/app/api/...`. (Bus requires key, others are effectively open/cached).
- **NJT**: Token refreshing logic is complex; verify `njt.ts` for latest headers.

---
*Last Updated: Jan 2026 by Antigravity*
