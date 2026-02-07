import UIKit
import Capacitor
import CoreLocation
import WidgetKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, CLLocationManagerDelegate {

    var window: UIWindow?
    let locationManager = CLLocationManager()
    let groupName = "group.com.antigravity.nyccommute"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Setup Location Manager for Background Updates
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters // Balanced
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.pausesLocationUpdatesAutomatically = false
        
        // Request Permissions
        // We really need Always for significant changes to be reliable in background,
        // but significant changes API often works with WhenInUse IF app is in background.
        // However, for best "wake up" reliability, requestAlways is standard for this pattern.
        locationManager.requestAlwaysAuthorization()
        
        // Start Monitoring (This wakes the app up)
        // Start Monitoring
        // Significant changes is too coarse for transfers (500m+).
        // switching to Standard + Visits for better granularity.
        locationManager.startUpdatingLocation()
        locationManager.startMonitoringVisits()
        print("✅ [AppDelegate] Started monitoring Standard Location + Visits")

        // Manual Registration Workaround
        DispatchQueue.main.async {
            if let rootVC = self.window?.rootViewController as? CAPBridgeViewController {
                let plugin = NYCBridgeImpl()
                rootVC.bridge?.registerPluginInstance(plugin)
                print("⚡️⚡️⚡️ [AppDelegate] Manually Registered NYCBridgeImpl! ⚡️⚡️⚡️")
            } else {
                print("❌ [AppDelegate] Could not find CAPBridgeViewController to register plugin.")
            }
        }
        
        return true
    }
    
    // MARK: - Location Delegate
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let latest = locations.last else { return }
        // Filter out old cached locations
        if latest.timestamp.timeIntervalSinceNow < -60 { return }
        
        print("📍 [AppDelegate] Background Location Update: \(latest.coordinate)")
        reorderWidgetData(location: latest)
    }
    
    // Visit monitoring is very power efficient and wakes the app on arrival/departure
    func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
        let location = CLLocation(latitude: visit.coordinate.latitude, longitude: visit.coordinate.longitude)
        print("📍 [AppDelegate] Visit Detected: \(visit.coordinate)")
        reorderWidgetData(location: location)
    }
    
    func reorderWidgetData(location: CLLocation) {
        // 1. Read
        guard let userDefaults = UserDefaults(suiteName: groupName) else { return }
        guard let jsonString = userDefaults.string(forKey: "widgetData") else { return }
        guard let data = jsonString.data(using: .utf8) else { return }
        
        // 2. Decode & Sort
        struct CommuteTuple: Codable {
            let id: String
            let label: String
            let mode: String
            let routeId: String?
            let stopId: String?
            let direction: String?
            let destinationName: String?
            let destinationStopId: String?
            let etas: [String]?
            let nickname: String?
            let lat: Double?
            let lon: Double?
        }
        
        do {
            var items = try JSONDecoder().decode([CommuteTuple].self, from: data)
            
            items.sort { (a, b) -> Bool in
                // Debug missing coords
                if a.lat == nil || a.lon == nil { print("⚠️ [AppDelegate] Item \(a.id) ('\(a.label)') is missing coordinates!") }
                if b.lat == nil || b.lon == nil { print("⚠️ [AppDelegate] Item \(b.id) ('\(b.label)') is missing coordinates!") }

                guard let latA = a.lat, let lonA = a.lon,
                      let latB = b.lat, let lonB = b.lon else {
                    return a.lat != nil // Prioritize items with location
                }
                let locA = CLLocation(latitude: latA, longitude: lonA)
                let locB = CLLocation(latitude: latB, longitude: lonB)
                return location.distance(from: locA) < location.distance(from: locB)
            }
            
            // 3. Save
            let newData = try JSONEncoder().encode(items)
            if let newJson = String(data: newData, encoding: .utf8) {
                userDefaults.set(newJson, forKey: "widgetData")
                // userDefaults.synchronize() // Not needed usually
                print("✅ [AppDelegate] Re-sorted widget data for new location!")
                
                // 4. Reload Widget
                WidgetCenter.shared.reloadAllTimelines()
            }
            
        } catch {
            print("❌ [AppDelegate] Failed to process widget data: \(error)")
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
