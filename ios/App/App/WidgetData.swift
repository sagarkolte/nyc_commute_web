import Foundation
import Capacitor
import WidgetKit

@objc(NYCBridgeImpl)
public class NYCBridgeImpl: CAPPlugin {
    
    // SERVER_FAIL_TEST_VARIABLE_SHOULD_BREAK_BUILD (Removed)
    
    // Check your Xcode > Signing & Capabilities to verify this exact Group ID
    let groupName = "group.com.antigravity.nyccommute"

    public override func load() {
        print("⚡️ NYCBridgeImpl [NATIVE]: LOADED via Capacitor!")
        _ = WatchConnector.shared // Init session early
    }

    @objc dynamic public func echo(_ call: CAPPluginCall) {
        let value = call.getString("value") ?? ""
        print("⚡️ CommuteWidget [NATIVE]: Echo received: \(value)")
        call.resolve([
            "value": value
        ])
    }
    

    
    @objc dynamic public func updateData(_ call: CAPPluginCall) {
        let json = call.getString("json") ?? "{}"
        print("⚡️ WidgetData [NATIVE]: Received JSON with length \(json.count)")
        
        if let userDefaults = UserDefaults(suiteName: groupName) {
            userDefaults.set(json, forKey: "widgetData")
            // userDefaults.synchronize() is deprecated but harmless for debugging reassurance
            print("⚡️ WidgetData [NATIVE]: Successfully wrote to App Group: \(groupName)")
            
            // Allow checking what was written
            let readBack = userDefaults.string(forKey: "widgetData")
            print("⚡️ WidgetData [NATIVE]: Verified write. Data preview: \(String(readBack?.prefix(50) ?? ""))...")
            
            call.resolve()
            
            // Sync to Watch
            WatchConnector.shared.sendData(json: json)
        } else {
            print("❌ WidgetData [NATIVE]: FAILED to access App Group \(groupName). Check Entitlements!")
            call.reject("Could not access App Group")
        }
    }
    
    @objc dynamic func reloadTimeline(_ call: CAPPluginCall) {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }
}
