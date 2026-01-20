//
//  CommuteWidget.swift
//  App
//
//  Created by Sagar Kolte on 1/17/26.
//
import WidgetKit
import SwiftUI
import CoreLocation

// MARK: - Data Models
struct CommuteTuple: Codable, Identifiable {
    let id: String
    let label: String
    let mode: String
    let routeId: String?
    let stopId: String?
    let direction: String?
    let destinationName: String?
    let destinationStopId: String? // Added for completeness, used in batch req
    let etas: [String]?
    let nickname: String?
    let lat: Double?
    let lon: Double?
}

struct BatchResponse: Codable {
    let results: [String: BatchResult]
}

struct BatchResult: Codable {
    let id: String
    let etas: [String]
    // let raw: ...
}

// MARK: - Location Manager
class WidgetLocationManager: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var handler: ((CLLocation?) -> Void)?
    
    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }
    
    func fetchLocation(completion: @escaping (CLLocation?) -> Void) {
        self.handler = completion
        // Check authorization status
        // Note: Widgets inherit app's permission but 'requestLocation' works best if already authorized
        if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
            manager.requestLocation()
        } else {
            // No permission, return nil immediately
            completion(nil)
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        handler?(locations.last)
        handler = nil
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("📍 Widget Location Fail: \(error.localizedDescription)")
        handler?(nil)
        handler = nil
    }
}

// MARK: - Provider
struct Provider: TimelineProvider {
    let groupName = "group.com.antigravity.nyccommute"
    let locationManager = WidgetLocationManager()
    
    // CONFIG: Backend URL
    // Use localhost for Simulator testing if needed, or PROD URL.
    // For "Post-Launch Refinement", we use the PROD URL.
    let backendUrl = "https://nyc-commute-web.vercel.app/api/batch-commute"
    
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), items: [])
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let items = loadItems()
        let entry = SimpleEntry(date: Date(), items: items)
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        // 1. Load basic items from defaults
        var items = loadItems()
        
        // 2. Async wrapper to fetch Network & Location
        let dispatchGroup = DispatchGroup()
        
        // Location
        var currentLocation: CLLocation? = nil
        dispatchGroup.enter()
        locationManager.fetchLocation { loc in
            currentLocation = loc
            dispatchGroup.leave()
        }
        
        // Network
        // We update 'items' with new ETAs
        // Create request body
        var updatedEtas: [String: [String]] = [:]
        
        dispatchGroup.enter()
        loadBatchData(items: items) { results in
            if let results = results {
                for (id, res) in results {
                    updatedEtas[id] = res.etas
                }
            }
            dispatchGroup.leave()
        }
        
        // Timeout/Completion
        // Widget logic dictates we shouldn't wait too long (limit is tight)
        // We'll trust DispatchGroup
        
        let waitResult = dispatchGroup.wait(timeout: .now() + 4.0) // 4 sec timeout
        
        if waitResult == .timedOut {
            print("⚠️ Widget: Fetch timed out")
        }
        
        // 3. Merge & Sort
        var finalItems: [CommuteTuple] = []
        
        for item in items {
            // Merge ETA
            let freshEtas = updatedEtas[item.id] ?? item.etas // Fallback to old (or nil)
            
            let newItem = CommuteTuple(
                id: item.id,
                label: item.label,
                mode: item.mode,
                routeId: item.routeId,
                stopId: item.stopId,
                direction: item.direction,
                destinationName: item.destinationName,
                destinationStopId: item.destinationStopId,
                etas: freshEtas,
                nickname: item.nickname,
                lat: item.lat,
                lon: item.lon
            )
            finalItems.append(newItem)
        }
        
        // 4. Auto-Sort
        if let loc = currentLocation {
            print("📍 Widget: Sorting by location: \(loc.coordinate)")
            finalItems.sort { (a, b) -> Bool in
                guard let latA = a.lat, let lonA = a.lon,
                      let latB = b.lat, let lonB = b.lon else {
                    // Start of list info vs End of list info? 
                    // Items with loc go first.
                    if a.lat != nil { return true }
                    if b.lat != nil { return false }
                    return false // Keep original order if both missing
                }
                
                let locA = CLLocation(latitude: latA, longitude: lonA)
                let locB = CLLocation(latitude: latB, longitude: lonB)
                
                return loc.distance(from: locA) < loc.distance(from: locB)
            }
        }
        
        // 5. Create Timeline
        let refreshDate = Calendar.current.date(byAdding: .minute, value: 5, to: Date())!
        let entry = SimpleEntry(date: Date(), items: finalItems)
        let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
        completion(timeline)
    }
    
    func loadBatchData(items: [CommuteTuple], completion: @escaping ([String: BatchResult]?) -> Void) {
        guard !items.isEmpty else {
            completion(nil)
            return
        }
        
        guard let url = URL(string: backendUrl) else { completion(nil); return }
        
        // Construct Request Dictionary
        let requests = items.map { item -> [String: Any] in
            return [
                "id": item.id,
                "mode": item.mode,
                "routeId": item.routeId ?? "",
                "stopId": item.stopId ?? "",
                "direction": item.direction ?? "",
                "destination": item.destinationStopId ?? ""
            ]
        }
        
        let body: [String: Any] = ["requests": requests]
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        } catch {
            print("❌ Widget: JSON Serialization Error")
            completion(nil)
            return
        }
        
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("❌ Widget: Network Error: \(error)")
                completion(nil)
                return
            }
            
            guard let data = data else { completion(nil); return }
            
            do {
                let decoded = try JSONDecoder().decode(BatchResponse.self, from: data)
                print("✅ Widget: Fetched Batch Data: \(decoded.results.count) items")
                completion(decoded.results)
            } catch {
                print("❌ Widget: Decode Error: \(error)")
                // print(String(data: data, encoding: .utf8) ?? "No Data")
                completion(nil)
            }
        }
        task.resume()
    }
    
    func loadItems() -> [CommuteTuple] {
        guard let userDefaults = UserDefaults(suiteName: groupName) else { return [] }
        guard let jsonString = userDefaults.string(forKey: "widgetData") else { return [] }
        guard let data = jsonString.data(using: .utf8) else { return [] }
        
        do {
            let items = try JSONDecoder().decode([CommuteTuple].self, from: data)
            return items
        } catch {
            print("❌ Widget: Load Error: \(error)")
            return []
        }
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let items: [CommuteTuple]
}

// MARK: - Views
// (Views remain largely unchanged, but we can remove formatting logic if we trust backend)

struct CommuteWidgetEntryView : View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryCircular:
            CircularView(item: entry.items.first)
        case .accessoryRectangular:
            RectangularView(item: entry.items.first)
        case .accessoryInline:
            InlineView(item: entry.items.first)
        default:
            SystemView(entry: entry)
        }
    }
    
    // Shared Helpers
    func formatRouteId(_ id: String) -> String {
        return id.replacingOccurrences(of: "MTA NYCT_", with: "")
                 .replacingOccurrences(of: "MTABC_", with: "")
                 .replacingOccurrences(of: "-SBS", with: "")
                 .replacingOccurrences(of: "SBS", with: "")
                 .replacingOccurrences(of: "+", with: "")
    }

    func colorForRoute(_ routeId: String, mode: String) -> Color {
        let r = routeId.replacingOccurrences(of: "MTA NYCT_", with: "")

        switch r {
        case "1", "2", "3": return Color(hex: "EE352E")
        case "4", "5", "6": return Color(hex: "00933C")
        case "7": return Color(hex: "B933AD")
        case "A", "C", "E": return Color(hex: "0039A6")
        case "B", "D", "F", "M": return Color(hex: "FF6319")
        case "N", "Q", "R", "W": return Color(hex: "FCCC0A")
        case "L": return Color(hex: "A7A9AC")
        case "G": return Color(hex: "6CBE45")
        case "J", "Z": return Color(hex: "996633")
        case "SI": return Color(hex: "0039A6")
        default: break
        }

        switch mode {
        case "lirr": return Color(hex: "0039A6")
        case "mnr": return Color(hex: "E00034")
        case "njt": return Color(hex: "F7941D")
        case "bus": return Color(hex: "0039A6")
        default: return .gray
        }
    }
}

struct SystemView: View {
    var entry: Provider.Entry
    
    func colorForRoute(_ routeId: String, mode: String) -> Color {
        return CommuteWidgetEntryView(entry: entry).colorForRoute(routeId, mode: mode)
    }
    
    func formatRouteId(_ id: String) -> String {
        return CommuteWidgetEntryView(entry: entry).formatRouteId(id)
    }

    var body: some View {
        ZStack {
            Color(hex: "000000").edgesIgnoringSafeArea(.all)
            VStack(spacing: 8) {
                if entry.items.isEmpty {
                    Text("Add routes in App")
                        .font(.caption)
                        .foregroundStyle(.gray)
                } else {
                    // Show top 2 items
                    ForEach(entry.items.prefix(2)) { item in
                        HStack(spacing: 0) {
                            Rectangle()
                                .fill(colorForRoute(item.routeId ?? "", mode: item.mode))
                                .frame(width: 6)
                            HStack(alignment: .center, spacing: 10) {
                                ZStack {
                                    if item.mode == "subway" {
                                        Circle()
                                            .fill(colorForRoute(item.routeId ?? "", mode: item.mode))
                                    } else {
                                        RoundedRectangle(cornerRadius: 4)
                                            .fill(colorForRoute(item.routeId ?? "", mode: item.mode))
                                    }
                                    Text(formatRouteId(item.routeId ?? "?"))
                                        .font(.system(size: 10, weight: .bold))
                                        .minimumScaleFactor(0.5)
                                        .foregroundColor(.white)
                                }
                                .frame(width: 24, height: 24)
                                VStack(alignment: .leading, spacing: 2) {
                                    if let nickname = item.nickname, !nickname.isEmpty {
                                        Text(nickname)
                                            .font(.system(size: 14, weight: .bold))
                                            .lineLimit(1)
                                            .foregroundColor(.white)
                                    } else {
                                        Text(item.label)
                                            .font(.system(size: 14, weight: .bold))
                                            .lineLimit(1)
                                            .foregroundColor(.white)
                                    }
                                    
                                    if let etas = item.etas, !etas.isEmpty {
                                        // Backend returns "X min". Just join them.
                                        Text(etas.prefix(3).joined(separator: ", "))
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundColor(Color(hex: "4ADE80"))
                                            .lineLimit(1)
                                    } else {
                                        Text("No departures")
                                            .font(.caption)
                                            .foregroundColor(.gray)
                                    }
                                }
                                Spacer()
                            }
                            .padding(.vertical, 8)
                            .padding(.horizontal, 8)
                        }
                        .background(Color(hex: "1C1C1E"))
                        .cornerRadius(8)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
            .padding(12)
        }
    }
}

struct CircularView: View {
    let item: CommuteTuple?
    
    var body: some View {
        if let item = item {
            VStack(spacing: 1) {
                if let nickname = item.nickname, !nickname.isEmpty, nickname.count <= 4 {
                    Text(nickname)
                        .font(.system(size: 10, weight: .heavy))
                        .minimumScaleFactor(0.6)
                } else {
                    Text(formatRouteId(item.routeId ?? "?"))
                        .font(.system(size: 12, weight: .heavy))
                        .minimumScaleFactor(0.5)
                }
                
                if let etas = item.etas, let first = etas.first {
                    Text(formatTime(first))
                        .font(.system(size: 10, weight: .bold))
                } else {
                    Text("--")
                        .font(.caption)
                }
            }
        } else {
            Text("N/A")
        }
    }
    
    func formatRouteId(_ id: String) -> String {
        return id.replacingOccurrences(of: "MTA NYCT_", with: "")
                 .replacingOccurrences(of: "MTABC_", with: "")
                 .replacingOccurrences(of: "-SBS", with: "")
                 .replacingOccurrences(of: "+", with: "")
    }
    
    func formatTime(_ t: String) -> String {
        return t.replacingOccurrences(of: " min", with: "m")
    }
}

struct RectangularView: View {
    let item: CommuteTuple?
    
    var body: some View {
        if let item = item {
            VStack(alignment: .leading, spacing: 1) {
                Text(item.nickname ?? item.destinationName ?? item.label)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white.opacity(0.9))
                    .lineLimit(1)
                
                Text(formatRouteId(item.routeId ?? "?"))
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundColor(.white)
                
                if let etas = item.etas, !etas.isEmpty {
                    Text(etas.prefix(3).map { $0.replacingOccurrences(of: " min", with: "") }.joined(separator: ", ") + " min")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                } else {
                    Text("--")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.gray)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text("Add a route")
                .font(.caption)
        }
    }
    
    func formatRouteId(_ id: String) -> String {
        return id.replacingOccurrences(of: "MTA NYCT_", with: "")
                 .replacingOccurrences(of: "MTABC_", with: "")
                 .replacingOccurrences(of: "-SBS", with: "")
                 .replacingOccurrences(of: "+", with: "")
    }
}

struct InlineView: View {
    let item: CommuteTuple?
    var body: some View {
        if let item = item, let etas = item.etas, let first = etas.first {
             Text("\(formatRouteId(item.routeId ?? "")): \(first)")
        } else {
            Text("Commute")
        }
    }
    func formatRouteId(_ id: String) -> String {
        return id.replacingOccurrences(of: "MTA NYCT_", with: "")
                 .replacingOccurrences(of: "MTABC_", with: "")
                 .replacingOccurrences(of: "-SBS", with: "")
                 .replacingOccurrences(of: "+", with: "")
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

@main
struct CommuteWidget: Widget {
    let kind: String = "CommuteWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                CommuteWidgetEntryView(entry: entry)
                    .containerBackground(Color.black, for: .widget)
            } else {
                CommuteWidgetEntryView(entry: entry)
                    .padding()
                    .background(Color.black)
            }
        }
        .configurationDisplayName("Commute Tracker")
        .description("View your top commutes.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
        .contentMarginsDisabled()
    }
}
