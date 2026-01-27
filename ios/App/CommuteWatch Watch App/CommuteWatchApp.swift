import SwiftUI
import WatchConnectivity
import WidgetKit

@main
struct CommuteWatchApp: App {
    init() {
        WatchSessionDelegate.shared.startSession()
    }
    
    var body: some Scene {
        WindowGroup {
            WatchContentView()
        }
    }
}

struct WatchContentView: View {
    // Listen to UserDefaults changes automatically
    @AppStorage("widgetData", store: UserDefaults(suiteName: "group.com.antigravity.nyccommute"))
    var widgetData: String = "[]"
    
    var body: some View {
        ScrollView {
            VStack {
                if let items = decodeItems(), !items.isEmpty {
                    // Reuse the SystemView from SharedWidgetCode.swift
                    // We construct a 'fake' entry for it.
                    SystemView(entry: SimpleEntry(date: Date(), items: items))
                } else {
                    Text("No Routes Found")
                        .font(.headline)
                    Text("Open iPhone App to sync")
                        .font(.caption2)
                        .foregroundStyle(.gray)
                }
            }
        }
    }
    
    func decodeItems() -> [CommuteTuple]? {
        guard let data = widgetData.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode([CommuteTuple].self, from: data)
    }
}

class ExtensionDelegate: NSObject, WKExtensionDelegate {
    func applicationDidFinishLaunching() {
        print("⌚️ WatchApp: Launched")
        WatchSessionDelegate.shared.startSession()
    }
}
