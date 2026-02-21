The user's prior session successfully stabilized and shipped the iOS version, including complex native widgets for iOS Lock Screens and Home Screens. The app is built on Next.js 15 wrapped in Capacitor. 

**Your Main Goal:**
Deploy "Commute NYC" to the Google Play Store as an Android App.

### Key Objectives:
1. **Android Setup**: Add the Android platform to this Capacitor project (`npx cap add android` etc.) and ensure the web app runs successfully in the Android Studio emulator.
2. **Native Android Home Screen Widget**: The core value proposition of this app is its real-time widget. You must build a Native Android Home Screen Widget (using Kotlin/Jetpack Glance or XML widgets). 
    - The widget should look similar to the iOS Dark Mode premium aesthetically.
    - Android does *not* support Lock Screen widgets the way iOS does natively, so focus **entirely** on an interactive Home Screen widget.
    - The widget needs to poll the existing Vercel Next.js `api/batch-commute` endpoints for live times.
3. **Data Sync**: Implement an Android native bridge (similar to the iOS `WidgetBridge`) that writes the user's saved commutes from Next.js `localStorage` into Android `SharedPreferences` so the widget knows what data to fetch.
4. **Location Sorting**: Implement location awareness within the widget code so the nearest user routes bubble up to the top.
5. **Google Play Store**: Generate the Android icons and assist with the Play Console release process for Version 1.0!

*(Before starting, please thoroughly review `architecture_handover.md` to understand the Next.js API architecture, the Fallback SQLite databases, and how the original iOS bridge was built for reference.)*
