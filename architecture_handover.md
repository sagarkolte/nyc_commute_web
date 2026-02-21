# Architecture & Handover Document

## Project Overview
**Name**: Commute NYC (formerly NYC Commute)
**Goal**: A commute tracker for NYC transit (Subway, Bus, LIRR, MNR, NJT, PATH, Ferry) with native iOS widgets (and soon Android).
**Repo**: `https://github.com/sagarkolte/nyc_commute_web`

## Tech Stack
*   **Frontend**: Next.js 15 (React 19), TypeScript, Framer Motion.
    *   *Build Mode*: Static Export (`output: 'export'`) for Capacitor compatibility.
*   **Mobile Wrapper**: Capacitor v6 (iOS, future Android).
*   **Native iOS**: Swift 5, SwiftUI (Widgets), WidgetKit.
*   **Backend**: Next.js API Routes (Hosted on Vercel at `https://nyc-commute-web.vercel.app`).
    *   *Note*: The mobile app queries the Vercel production URL directly, as local API routes are stripped during static export.

## Architecture & APIs

### 1. Data Flow & APIs
1.  **User Data**: User's selected commutes are stored in `localStorage` (`nyc_commute_tuples`).
2.  **Live Fetching**: The app and widgets fetch real-time ETAs via Next.js backend API routes.
3.  **Supported Modes & APIs**:
    *   **MTA Subway/Bus, LIRR, MNR**: Real-time `gtfs-rt` parsing via the `/api/mta` route.
    *   **NJ Transit (NJT)**: Real-time API integration with fallback mechanisms for rate limits.
    *   **PATH, Staten Island Railway (SIR), NYC Ferry**: Real-time APIs supported.
4.  **Database Fallback Mechanism**:
    *   For specific modes (NYC Ferry, PATH, SIR), real-time feeds can sometimes be unreliable or lack data late at night.
    *   We implemented a **SQLite Database Fallback** (`src/lib/ferry_sql.ts`, `sir_sql.ts`, `path_sql.ts`) containing static GTFS schedule data.
    *   If the live API returns empty results, the backend automatically queries the local SQLite databases (`src/data/sir_stations.sqlite`, `path_stations.sqlite`, `si_ferry_schedule.sqlite`) to provide scheduled ETAs as a fallback. This guarantees the widget always shows data.

### 2. Native Bridge (JS <-> Swift)
*   **JS Side**: `src/lib/widget_bridge.ts` (Capacitor Plugin definition). Syncs `localStorage` to iOS.
*   **Swift Side**: `ios/App/App/WidgetData.swift` (`NYCBridgeImpl`).
*   **Mechanism**:
    *   App saves data -> Calls `WidgetData.updateData(json)`.
    *   Swift writes JSON to `UserDefaults(suiteName: "group.com.antigravity.nyccommute")`.
    *   Swift triggers `WidgetCenter.shared.reloadAllTimelines()`.

### 3. Widget Architecture & Enhancements (Swift)
*   **Independent Execution**: The Widget (`ios/App/CommuteWidget/CommuteWidget.swift`) is fully autonomous and operates without the main app running.
*   **Location Awareness Enhancement**:
    1.  Widget wakes up and initializes its own `CLLocationManager`.
    2.  We implemented strict **Timeouts (2-3 seconds)** to prevent location fetching from stalling the widget render loop.
    3.  We implemented **Location Caching** to gracefully degrade if GPS is unavailable or times out.
    4.  It sorts the saved UI cards based on geographic proximity to the user's current coordinates.
*   **Dual-Direction Batch Fetching**:
    *   To resolve edge cases (e.g., NYC Ferry showing blank data), the widget uses robust mode-mapping from `routeId` and explicitly fires parallel API requests for both directions (North/South) when ambiguity exists.
*   **UI Layouts**: Support for `systemSmall`, `systemMedium`, and older legacy widget variations to ensure padding/background consistency across iOS 17 and iOS 18.

### 4. Build System
*   **Command**: `npm run build:mobile`
*   **Workflow**: Hides `src/app/api`, runs `next build`, performs `npx cap sync`, then restores APIs.

## Major Achievements (Current Session)
1. **Universal Widget Reliability**: Solved multi-threading crashes and synchronization latencies that were causing widgets to freeze or blank out.
2. **Mode-Specific Granularity**: Scaled the iOS widget to correctly map and request ETAs for all edge-case transit systems (LIRR, Metro-North, NJT, PATH, Ferries).
3. **NYC Ferry Reliability**: Discovered live-feed discrepancies and engineered a dual-direction network request combined with a SQLite Schedule Fallback to ensure 100% uptime for Ferry ETAs on the lock screen.
4. **App Store Readiness**: Rebranded to "Commute NYC", finalized all App Store metadata, generated precision 6.5" and 12.9" device screenshots using ImageMagick, and achieved a successful upload to App Store Connect Version 1.1 (Build 49).

## Next Agent Goal: Android App & Widget Deployment
**Objective**: Port the fully functioning web app and Native iOS Widget features over to Android for a Google Play Store release.

**Key Requirements**:
1.  **Android Studio & Capacitor**: Initialize and configure the Android platform via Capacitor (`npx cap add android`).
2.  **Home Screen Widget**: Build a native Android Home Screen App Widget (using Jetpack Glance or XML/Kotlin) that mirrors the iOS design (dark theme, live GTFS-RT times, proximity-based sorting).
3.  *Important Note*: Android widgets behave differently regarding updating frequencies. The core focus must be on Home Screen Widgets (Android does not natively support Lock Screen widgets in the same way iOS does).
4.  **Native Bridge**: Replicate the iOS `WidgetBridge` to write `localStorage` data from Next.js into Android `SharedPreferences` so the Android widget can read the user's commute configuration.
5.  **Deployment**: Prepare Android assets, icons, and metadata for a Google Play Store submission.
