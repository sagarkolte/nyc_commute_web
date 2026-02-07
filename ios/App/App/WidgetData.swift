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

    @objc dynamic func updateEtas(_ call: CAPPluginCall) {
        guard let json = call.getString("json"),
              let updatesData = json.data(using: .utf8) else {
            call.reject("Invalid JSON")
            return
        }

        // Define models locally for decoding
        struct ETAUpdate: Codable {
            let id: String
            let etas: [String]
        }
        
        // Full Tuple (Reuse from other files, but redefined here for simplicity as we can't share models easily across targets without a framework)
        struct CommuteTuple: Codable {
            let id: String
            let label: String
            let mode: String
            let routeId: String?
            let stopId: String?
            let direction: String?
            let destinationName: String?
            let destinationStopId: String?
            var etas: [String]?
            let nickname: String?
            let lat: Double?
            let lon: Double?
        }

        // 1. Read Existing (Sorted) Data
        guard let userDefaults = UserDefaults(suiteName: groupName),
              let jsonString = userDefaults.string(forKey: "widgetData"),
              let data = jsonString.data(using: .utf8) else {
            // If no data exists, we can't update ETAs. Just resolve.
            print("⚠️ WidgetData [NATIVE]: No existing data to update ETAs.")
            call.resolve()
            return
        }

        do {
            var existingItems = try JSONDecoder().decode([CommuteTuple].self, from: data)
            let updates = try JSONDecoder().decode([ETAUpdate].self, from: updatesData)
            
            // 2. Merge Updates (O(N*M) but N is small, < 20)
            // Create a lookup map for updates
            let updateMap = Dictionary(uniqueKeysWithValues: updates.map { ($0.id, $0.etas) })
            
            var hasChanges = false
            for i in 0..<existingItems.count {
                let id = existingItems[i].id
                if let newEtas = updateMap[id] {
                    existingItems[i].etas = newEtas
                    hasChanges = true
                }
            }
            
            if hasChanges {
                let newData = try JSONEncoder().encode(existingItems)
                if let newJson = String(data: newData, encoding: .utf8) {
                    userDefaults.set(newJson, forKey: "widgetData")
                    print("⚡️ WidgetData [NATIVE]: Merged ETAs into \(existingItems.count) items (Preserved Sort).")
                    
                    // Sync to Watch (as full payload)
                    WatchConnector.shared.sendData(json: newJson)
                }
            } else {
                 print("⚡️ WidgetData [NATIVE]: No matching IDs found for ETA update.")
            }
            
            call.resolve()
        } catch {
            print("❌ WidgetData [NATIVE]: Failed to merge ETAs: \(error)")
            call.reject(error.localizedDescription)
        }
    }
}
