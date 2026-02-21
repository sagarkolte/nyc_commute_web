The user's prior session successfully stabilized and shipped the iOS version, including complex native widgets for iOS Lock Screens and Home Screens. The app is built on Next.js 15 wrapped in Capacitor. 

**Your Main Goal:**
Deploy "Commute NYC" to the Google Play Store as an Android App.

### Key Objectives:
1. **Clone & Setup**: Clone the project repository from `https://github.com/sagarkolte/nyc_commute_web.git`, run `npm install`, and verify the Next.js web build works locally.
2. **Android Setup**: Add the Android platform to this Capacitor project (`npx cap add android` etc.) and ensure the web app runs successfully in the Android Studio emulator.
3. **Native Android Home Screen Widget**: The core value proposition of this app is its real-time widget. You must build a Native Android Home Screen Widget (using Kotlin/Jetpack Glance or XML widgets). 
    - The widget should look similar to the iOS Dark Mode premium aesthetically.
    - Android does *not* support Lock Screen widgets the way iOS does natively, so focus **entirely** on an interactive Home Screen widget.
    - The widget needs to poll the existing Vercel Next.js (`https://nyc-commute-web.vercel.app/api/batch-commute`) endpoints for live times.
4. **Data Sync**: Implement an Android native bridge (similar to the iOS `WidgetBridge`) that writes the user's saved commutes from Next.js `localStorage` into Android `SharedPreferences` so the widget knows what data to fetch.
5. **Location Sorting**: Implement location awareness within the widget code so the nearest user routes bubble up to the top based on device GPS.
6. **Google Play Store**: Generate the Android icons and assist with the Play Console release process for Version 1.0!

*(Before starting, please thoroughly review `architecture_handover.md` to understand the Next.js API architecture, the Fallback SQLite databases, and how the original iOS bridge was built for reference.)*
