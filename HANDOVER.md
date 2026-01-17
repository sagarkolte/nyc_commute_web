# Project Handover & Context

## Migration Status
**Date:** 2026-01-16
**Action:** Moved project from Cloud Storage to local `~/nyc_commute_web` for performance.
- [x] Repository cloned from `origin/main`.
- [x] Dependencies installed (`npm install`).
- [x] Build verified (`npm run build`).

## Immediate Goals: Mobile App (iOS)
The primary active objective is to **fix the iOS app build**.
1.  **Issue**: App launches to a **White Screen** on the simulator/device.
2.  **Suspected Causes**:
    *   **Static Export**: ensuring `next.config.ts` has `output: 'export'` and correct image unoptimization.
    *   **Data Integrity**: `sir_stations.json` and `path_stations.json` caused build/runtime errors previously.
3.  **Widgets**: Ensure `CommuteWidget` target is correctly embedded and sharing data.

## Project Overview
**NYC Commute Tracker**
A Next.js 15 application wrapped with Capacitor for iOS.
- **Features**: Real-time tracking for MTA (Subway, Bus, LIRR, MNR), NJ Transit (Rail, Bus), and PATH.
- **State**: The web version works well. The iOS native wrapper is currently being debugged.

## Action Plan for Agent
1.  **Verification**: Confirm `npm run dev` works in this new folder.
2.  **iOS Debugging**:
    *   Run `npx cap sync`.
    *   Run `npx cap open ios`.
    *   Explore `next.config.ts` / Console logs for the "White Screen" error.
