# Architecture & Handover Document

## Project Overview
**Name**: NYC Commute (Transit Pulse)
**Goal**: A commute tracker for NYC transit (Subway, Bus, LIRR, MNR, NJT, PATH, Ferry) with a native iOS Widget.
**Repo**: `https://github.com/sagarkolte/nyc_commute_web`

## Tech Stack
*   **Frontend**: Next.js 15 (React 19), TypeScript, Framer Motion.
    *   *Build Mode*: Static Export (`output: 'export'`) for Capacitor compatibility.
*   **Mobile Wrapper**: Capacitor v6 (iOS).
*   **Native iOS**: Swift 5, SwiftUI (Widgets), WidgetKit.
*   **Backend**: Next.js API Routes (Hosted on Vercel).
    *   *Note*: The mobile app queries the Vercel production URL (`https://nyc-commute-web.vercel.app/api/...`) directly, as the local API routes are stripped during static export.

## Architecture

### 1. Data Flow (App)
1.  **User Data**: Stored in `localStorage` (`nyc_commute_tuples`).
2.  **Fetching**: `CountdownCard.tsx` fetches live data from the backend.
3.  **Persistence**: Changes to `localStorage` are **synced** to the Native Layer via `WidgetBridge`.

### 2. Native Bridge (JS <-> Swift)
*   **JS Side**: `src/lib/widget_bridge.ts` (Capacitor Plugin definition).
*   **Swift Side**: `ios/App/App/WidgetData.swift` (`NYCBridgeImpl`).
*   **Mechanism**:
    *   App saves data -> Calls `WidgetData.updateData(json)`.
    *   Swift writes JSON to `UserDefaults(suiteName: "group.com.antigravity.nyccommute")`.
    *   Swift calls `WidgetCenter.shared.reloadAllTimelines()`.

### 3. Widget Architecture (Swift)
*   **Code**: `ios/App/CommuteWidget/CommuteWidget.swift`.
*   **Independence**: The Widget is **autonomous**. It does NOT rely on the App being open.
*   **Data Source**: Reads the list of saved routes from `UserDefaults` (App Group).
*   **Location**: Has its own `CLLocationManager`.
*   **Auto-Sort**:
    1.  Widget wakes up (Timeline Reload).
    2.  Fetches GPS location.
    3.  Sorts the saved cards based on proximity to the station.
    4.  Fetches live ETAs from the APIs (batch request).
    5.  Renders the Timeline.

### 4. Build System
*   **Command**: `npm run build:mobile`
*   **Process**:
    1.  Hides `src/app/api` (to prevent Next.js from trying to build serverless functions during static export).
    2.  Runs `next build`.
    3.  Runs `npx cap sync` (Copies `out/` to `ios/App/App/public`).
    4.  Restores `src/app/api`.

## Key Files
*   `src/lib/storage.ts`: Central data manager. Handles debouncing of native writes.
*   `src/lib/location.ts`: Coordinate logic for sorting.
*   `ios/App/CommuteWidget/CommuteWidget.swift`: The Widget logic.
*   `ios/App/App/WidgetData.swift`: The Bridge logic.

## Deployment Status
*   **App Store**: Not yet deployed.
*   **Capabilities**:
    *   **App Groups**: `group.com.antigravity.nyccommute` (Required for data sharing).
    *   **Location**: `NSWidgetWantsLocation` (Info.plist) + `NSLocationWhenInUseUsageDescription`.

## Troubleshooting: "Missing CapApp-SPM" Error
If the build fails with "Missing package product 'CapApp-SPM'", it is because `npx cap sync` sometimes reverts the `Package.swift` platform version to an incompatible default (e.g., `.v26`).

**The Fix**:
1. Open `ios/App/CapApp-SPM/Package.swift`.
2. Locate the line: `platforms: [.iOS(.v26)],`.
3. Change it to: `platforms: [.iOS(.v13)],`.
4. Clean Build Folder in Xcode and Rebuild.
