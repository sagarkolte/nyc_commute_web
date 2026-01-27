import Foundation
import WatchConnectivity
import WidgetKit

class WatchSessionDelegate: NSObject, WCSessionDelegate {
    static let shared = WatchSessionDelegate()
    
    // Must match the group name used in iOS App
    // Note: Watch Apps don't strictly need App Groups to share data with *themselves*,
    // but code sharing with Widget usually implies UserDefaults usage.
    // However, Watch App + Watch Widget share data via UserDefaults(suiteName: nil) (standard)
    // or a specific suite. We'll use standard to keep it simple unless we add a Watch App Group.
    // Actually, Watch Widgets need UserDefaults(suiteName: ...) to share with the main Watch App.
    // Let's assume we use standard UserDefaults for now, or the same group name if we added it to the Watch capability.
    
    // For simplicity: The Widget code uses `group.com.antigravity.nyccommute`. 
    // We MUST use that suite name.
    let groupName = "group.com.antigravity.nyccommute"
    
    override private init() {
        super.init()
    }
    
    func startSession() {
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }
    
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        print("⌚️ WatchApp: Session activated: \(activationState.rawValue)")
    }
    
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        if let json = applicationContext["widgetData"] as? String {
            print("⌚️ WatchApp: Received Data!")
            
            if let userDefaults = UserDefaults(suiteName: groupName) {
                userDefaults.set(json, forKey: "widgetData")
                print("⌚️ WatchApp: Saved to Group UserDefaults")
                
                if #available(watchOS 9.0, *) {
                    WidgetCenter.shared.reloadAllTimelines()
                }
            }
        }
    }
}
