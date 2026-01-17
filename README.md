# NYC Commute Tracker

This is a Next.js project wrapped with Capacitor for iOS, featuring a Home Screen Widget.

## 📱 Widget Status (Jan 2026) -> "The Dark Mode Update"

The iOS Widget is fully functional and redesigned with a premium Dark Mode aesthetic.

### Features
*   **Dark Mode**: Pitch black background (`#000000`) with floating cards (`#1C1C1E`).
*   **Live Data**: Displays real-time ETAs (e.g., "5 min, 12 min") synced from the main App.
*   **Badges**: Accurate color-coded badges (Green Circles for 4/5/6, Blue Squares for LIRR, etc.).
*   **Bridging**: React pushes data to the Widget via `UserDefaults` (App Group: `group.com.antigravity.nyccommute`).

## ⚠️ Critical Deployment Notes (Handover)

**If you are deploying to a new device or debugging, READ THIS.**

### 1. The `Package.swift` Glitch
Every time you run `npx cap sync`, the file `ios/App/CapApp-SPM/Package.swift` MIGHT revert to using `.iOS(.v26)`, which doesn't exist.
*   **Symptom**: Xcode errors saying "XCFramework not found" or "Missing package product".
*   **Fix**:
    1.  Open `ios/App/CapApp-SPM/Package.swift`.
    2.  Change `platforms: [.iOS(.v26)]` to `platforms: [.iOS(.v13)]`.
    3.  In Xcode: **File > Packages > Reset Package Caches**.
    4.  **Product > Clean Build Folder**.

### 2. Physical Device "Black Screen"
If the app shows a black screen on a real phone:
*   **Cause**: It's trying to connect to `localhost:3000` (Dev Mode).
*   **Fix**:
    1.  Open `capacitor.config.ts`.
    2.  **Remove** the `server` block entirely.
    3.  Ensure `webDir` is set to `'out'`.
    4.  Run `npm run build && npx cap sync`.

### 3. Widget Data Sync Failure (The "Old Bundle" Issue)
If the App runs but the Widget stays empty ("Add routes in App") even after adding routes:
*   **Cause**: The phone is running an **stale version** of the Web App (bundle) that doesn't have the bridging code.
*   **Verify**: Go to **Settings**. If you DO NOT see a "Widget Debug" section, you are on an old build.
*   **Fix**:
    1.  Run `npm run build && npx cap sync`.
    2.  **Wait for it to finish.**
    3.  Run from Xcode again.
    4.  Go to Settings -> **Force Widget Sync** to kickstart the connection.

## 🛠 Project Setup

### Development (Simulator)
1.  `npm run dev` (Starts Next.js on port 3000).
2.  `npx cap sync` (Ensure `capacitor.config.ts` has the `server` block enabled for Live Reload).
3.  Open `ios/App/App.xcworkspace`.
4.  Run the **App** Scheme.

### Production (Physical Device)
1.  **Comment out** `server` in `capacitor.config.ts`.
2.  `npm run build`
3.  `npx cap sync`
4.  **Fix `Package.swift`** (See Glitch above).
5.  Open Xcode.
6.  Reset Package Caches (if needed).
7.  Run the **App** Scheme on your Device.

## 📂 Key Files
*   **Bridge (JS)**: `src/lib/widget_bridge.ts`, `src/lib/storage.ts` (Sync logic).
*   **Bridge (Native)**: `ios/App/App/WidgetData.swift` (The Writer).
*   **Widget (Swift)**: `ios/App/CommuteWidget/CommuteWidget.swift` (The Reader/Viewer).
