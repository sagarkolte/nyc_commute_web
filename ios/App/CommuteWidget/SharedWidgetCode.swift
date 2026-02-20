//
//  SharedWidgetCode.swift
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
    let arrivals: [Double]?
}

// MARK: - Location Manager
class WidgetLocationManager: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation?, Never>?
    
    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }
    
    func fetchLocation(timeout: TimeInterval = 2.0) async -> CLLocation? {
        return await withTaskGroup(of: CLLocation?.self) { group in
            group.addTask {
                return await withCheckedContinuation { continuation in
                    self.continuation = continuation
                    if self.manager.authorizationStatus == .authorizedWhenInUse || self.manager.authorizationStatus == .authorizedAlways {
                        self.manager.requestLocation()
                    } else {
                        self.resume(with: nil)
                    }
                }
            }
            
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                return nil
            }
            
            let result = await group.next() ?? nil
            self.continuation = nil
            return result
        }
    }
    
    private func resume(with location: CLLocation?) {
        continuation?.resume(returning: location)
        continuation = nil
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        resume(with: locations.last)
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("📍 Widget Location Fail: \(error.localizedDescription)")
        resume(with: nil)
    }
}

// MARK: - Provider
struct Provider: TimelineProvider {
    typealias Entry = SimpleEntry
    
    let groupName = "group.com.antigravity.nyccommute"
    let locationManager = WidgetLocationManager()
    
    // PROD URL
    let backendUrl = "https://nyc-commute-web.vercel.app/api/batch-commute"
    
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), items: [], lastFetchDate: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let items = loadItems()
        let entry = SimpleEntry(date: Date(), items: items, lastFetchDate: Date())
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SimpleEntry>) -> ()) {
        Task {
            let items = loadItems()
            
            // Fetch Data
            let results = await fetchBatchData(items: items)
            
            // Map Results
            let updatedItems = items.map { item -> CommuteTuple in
                if let res = results?[item.id] {
                    return CommuteTuple(
                        id: item.id,
                        label: item.label,
                        mode: item.mode,
                        routeId: item.routeId,
                        stopId: item.stopId,
                        direction: item.direction,
                        destinationName: item.destinationName,
                        destinationStopId: item.destinationStopId,
                        etas: res.etas,
                        nickname: item.nickname,
                        lat: item.lat,
                        lon: item.lon
                    )
                }
                return item
            }
            
            let entry = SimpleEntry(date: Date(), items: updatedItems, lastFetchDate: Date())
            let refreshDate = Calendar.current.date(byAdding: .minute, value: 5, to: Date())!
            let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
            completion(timeline)
        }
    }


    
    // MARK: - Location Caching Helpers
    func saveLastLocation(_ loc: CLLocation) {
        guard let userDefaults = UserDefaults(suiteName: groupName) else { return }
        userDefaults.set(loc.coordinate.latitude, forKey: "lastLat")
        userDefaults.set(loc.coordinate.longitude, forKey: "lastLon")
    }
    
    func loadLastLocation() -> CLLocation? {
        guard let userDefaults = UserDefaults(suiteName: groupName) else { return nil }
        let lat = userDefaults.double(forKey: "lastLat")
        let lon = userDefaults.double(forKey: "lastLon")
        
        // Basic check for uninitialized defaults (0,0 is technically valid but unlikely for NYC)
        if lat == 0 && lon == 0 { return nil }
        
        return CLLocation(latitude: lat, longitude: lon)
    }
    
    func fetchBatchData(items: [CommuteTuple]) async -> [String: BatchResult]? {
        guard !items.isEmpty else { return nil }
        guard let url = URL(string: backendUrl) else { return nil }
        
        var requests: [[String: Any]] = []
        var altIds: [String: String] = [:] // Map ALT_ID -> Original_ID
        
        for item in items {
            // Fix Mode Mapping
            var mode = item.mode
            if let r = item.routeId {
                if r.hasPrefix("MNR") { mode = "mnr" }
                if r == "LIRR" { mode = "lirr" }
                if r == "PATH" || r == "Path" { mode = "path" }
                
                // NYC Ferry: Check generic ID and specific route names (handling legacy data)
                let ferryRoutes = ["NYC Ferry", "East River", "Astoria", "South Brooklyn", "Rockaway East", "Rockaway West", "Rockaway-Soundview", "St. George", "Soundview"]
                if r == "nyc-ferry" || ferryRoutes.contains(r) { mode = "nyc-ferry" }
                
                if r == "SI Ferry" { mode = "si-ferry" }
                if r == "NJT" { mode = "njt" }
            }
            
            // Base Request (matches stored direction, usually 'N')
            let req: [String: Any] = [
                "id": item.id,
                "mode": mode,
                "routeId": item.routeId ?? "",
                "stopId": item.stopId ?? "",
                "direction": item.direction ?? "",
                "destination": item.destinationStopId ?? ""
            ]
            requests.append(req)
            
            // NYC Ferry Dual-Direction Hack
            // The widget often forces 'N', but the GTFS feed might use 'S' or vice versa.
            // Since we can't be sure, we request BOTH directions and merge.
            if mode == "nyc-ferry" {
                let altId = item.id + "_ALT"
                altIds[altId] = item.id
                
                let altDir = (item.direction == "N") ? "S" : "N"
                var altReq = req
                altReq["id"] = altId
                altReq["direction"] = altDir
                requests.append(altReq)
            }
        }
        
        let body: [String: Any] = ["requests": requests]
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
            
            let (data, _) = try await URLSession.shared.data(for: request)
            let decoded = try JSONDecoder().decode(BatchResponse.self, from: data)
            
            // Post-Process: Merge ALT results into Main results
            var finalResults = decoded.results
            
            for (altId, originalId) in altIds {
                if let altResult = finalResults[altId], let originalResult = finalResults[originalId] {
                    // Both have data. Merge ETAs.
                    let combinedEtas = originalResult.etas + altResult.etas
                    let uniqueEtas = Array(Set(combinedEtas)).sorted { a, b in
                         // Basic sort: "2 min" < "10 min"
                         let valA = Int(a.components(separatedBy: " ").first ?? "999") ?? 999
                         let valB = Int(b.components(separatedBy: " ").first ?? "999") ?? 999
                         return valA < valB
                    }
                    
                    // Merge arrivals if present
                    var combinedArrivals: [Double] = []
                    if let a1 = originalResult.arrivals { combinedArrivals.append(contentsOf: a1) }
                    if let a2 = altResult.arrivals { combinedArrivals.append(contentsOf: a2) }
                    combinedArrivals.sort()
                    
                    finalResults[originalId] = BatchResult(id: originalId, etas: uniqueEtas, arrivals: combinedArrivals.isEmpty ? nil : combinedArrivals)
                } else if let altResult = finalResults[altId] {
                    // Only Alt has result. Move it to Main, but update ID.
                    finalResults[originalId] = BatchResult(id: originalId, etas: altResult.etas, arrivals: altResult.arrivals)
                }
                // Remove the temp/alt entry
                finalResults.removeValue(forKey: altId)
            }
            
            print("✅ Widget: Fetched Batch Data: \(finalResults.count) items (Merged)")
            return finalResults
        } catch {
            print("❌ Widget: Network/Decode Error: \(error)")
            return nil
        }
    }
    
    func loadItems() -> [CommuteTuple] {
        guard let userDefaults = UserDefaults(suiteName: groupName) else {
             return [CommuteTuple(id: "err", label: "No App Group", mode: "subway", routeId: "X", stopId: "", direction: "", destinationName: "Check Entitlements", destinationStopId: "", etas: ["--"], nickname: "Config Error", lat: 0, lon: 0)]
        }
        guard let jsonString = userDefaults.string(forKey: "widgetData") else {
            return [CommuteTuple(id: "err", label: "No Data", mode: "subway", routeId: "X", stopId: "", direction: "", destinationName: "Open App to Add", destinationStopId: "", etas: ["--"], nickname: "No Routes", lat: 0, lon: 0)]
        }
        guard let data = jsonString.data(using: .utf8) else {
            return []
        }
        
        do {
        let items = try JSONDecoder().decode([CommuteTuple].self, from: data)
        return items
    } catch let DecodingError.keyNotFound(key, context) {
        print("❌ Widget: Missing Key: \(key.stringValue) - \(context.debugDescription)")
        return [CommuteTuple(id: "err", label: "Missing Key", mode: "subway", routeId: "X", stopId: "", direction: "", destinationName: key.stringValue, destinationStopId: "", etas: ["--"], nickname: "Key: \(key.stringValue)", lat: 0, lon: 0)]
    } catch let DecodingError.typeMismatch(type, context) {
        print("❌ Widget: Type Mismatch: \(type) - \(context.debugDescription)")
        return [CommuteTuple(id: "err", label: "Type Error", mode: "subway", routeId: "X", stopId: "", direction: "", destinationName: "\(type)", destinationStopId: "", etas: ["--"], nickname: "Type: \(type)", lat: 0, lon: 0)]
    } catch let DecodingError.valueNotFound(value, context) {
        print("❌ Widget: Value Null: \(value) - \(context.debugDescription)")
        return [CommuteTuple(id: "err", label: "Null Value", mode: "subway", routeId: "X", stopId: "", direction: "", destinationName: "\(value)", destinationStopId: "", etas: ["--"], nickname: "Null: \(value)", lat: 0, lon: 0)]
    } catch {
        print("❌ Widget: Load Error: \(error)")
        return [CommuteTuple(id: "err", label: "Decode Error", mode: "subway", routeId: "X", stopId: "", direction: "", destinationName: error.localizedDescription, destinationStopId: "", etas: ["--"], nickname: "Data Corrupt", lat: 0, lon: 0)]
    }
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let items: [CommuteTuple]
    let lastFetchDate: Date // Added for "Updated x mins ago"
}

// MARK: - Extensions
extension View {
    @ViewBuilder
    func widgetBackground(_ color: Color) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(color, for: .widget)
        } else {
            background(color.edgesIgnoringSafeArea(.all))
        }
    }
}

// MARK: - Views
// (Views remain largely unchanged, but we can remove formatting logic if we trust backend)

struct CommuteWidgetEntryView : View {
    var entry: SimpleEntry
    var showsWidgetPadding: Bool // Controls manual padding (True for Modern, False for Legacy)
    @Environment(\.widgetFamily) var family

    var body: some View {
        if #available(iOS 16.0, *) {
            switch family {
            case .accessoryCircular:
                CircularView(item: entry.items.first)
                    .widgetBackground(.clear)
            case .accessoryRectangular:
                RectangularView(item: entry.items.first)
                    .widgetBackground(.clear)
            case .accessoryInline:
                InlineView(item: entry.items.first)
                    .widgetBackground(.clear)
            default:
                SystemView(entry: entry, showsWidgetPadding: showsWidgetPadding)
                    .widgetBackground(.black)
            }
        } else {
            SystemView(entry: entry, showsWidgetPadding: showsWidgetPadding)
                .widgetBackground(.black)
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
        case "S": return Color(hex: "808183")
        case "SI": return Color(hex: "0039A6")
        default: break
        }

        switch mode {
        case "lirr": return Color(hex: "0039A6")
        case "mnr": return Color(hex: "E00034")
        case "njt": return Color(hex: "F7941D")
        case "bus": return Color(hex: "0039A6")
        default: return Color(hex: "2C3E50")
        }
    }
}

// MARK: - Reusable Hero Card View
struct HeroCardView: View {
    let item: CommuteTuple
    let lastFetchDate: Date
    var showsWidgetPadding: Bool
    
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
        case "S": return Color(hex: "808183")
        case "SI": return Color(hex: "0039A6")
        default: break
        }
        switch mode {
        case "lirr": return Color(hex: "0039A6")
        case "mnr": return Color(hex: "E00034")
        case "njt": return Color(hex: "F7941D")
        case "bus": return Color(hex: "0039A6")
        default: return Color(hex: "2C3E50")
        }
    }
    
    func formatRouteId(_ id: String) -> String {
        return id.replacingOccurrences(of: "MTA NYCT_", with: "")
                 .replacingOccurrences(of: "MTABC_", with: "")
                 .replacingOccurrences(of: "-SBS", with: "")
                 .replacingOccurrences(of: "SBS", with: "")
                 .replacingOccurrences(of: "+", with: "")
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Large Route Icon
            ZStack {
                Circle()
                    .fill(colorForRoute(item.routeId ?? "", mode: item.mode))
                Text(formatRouteId(item.routeId ?? "?"))
                    .font(.system(size: 20, weight: .bold)) 
                    .minimumScaleFactor(0.4)
                    .lineLimit(1)
                    .foregroundColor(.white)
                    .padding(.horizontal, 4)
            }
            .frame(width: 56, height: 56)
            .padding(.top, 4)
            .padding(.bottom, 14)
            
            // Route Label
            Text(item.nickname ?? item.label)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
                .lineLimit(1)
                .padding(.bottom, 2)
            
            // ETAs
            if let etas = item.etas, !etas.isEmpty {
                Text(etas.prefix(3).map { $0.replacingOccurrences(of: " min", with: "") }.joined(separator: ", ") + " Min")
                    .font(.system(size: 24, weight: .bold))
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                    .foregroundColor(etas.first == "--" ? .gray : .white)
            } else {
                Text("--")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.gray)
            }
            
            Spacer()
            
            // Footer
            let diff = Date().timeIntervalSince(lastFetchDate)
            let mins = Int(diff / 60)
            let timeText = mins == 0 ? "Just now" : "\(mins) min ago"
            
            Text("Updated \(timeText)")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.gray.opacity(0.6))
        }
        .padding(showsWidgetPadding ? 16 : 0)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SystemView: View {
    var entry: SimpleEntry
    var showsWidgetPadding: Bool
    @Environment(\.widgetFamily) var family
    
    // Shared Helpers for List Layout
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
        case "S": return Color(hex: "808183")
        case "SI": return Color(hex: "0039A6")
        default: break
        }
        switch mode {
        case "lirr": return Color(hex: "0039A6")
        case "mnr": return Color(hex: "E00034")
        case "njt": return Color(hex: "F7941D")
        case "bus": return Color(hex: "0039A6")
        default: return Color(hex: "2C3E50")
        }
    }
    
    func formatRouteId(_ id: String) -> String {
        return id.replacingOccurrences(of: "MTA NYCT_", with: "")
                 .replacingOccurrences(of: "MTABC_", with: "")
                 .replacingOccurrences(of: "-SBS", with: "")
                 .replacingOccurrences(of: "SBS", with: "")
                 .replacingOccurrences(of: "+", with: "")
    }

    var body: some View {
        Group {
            if family == .systemSmall {
                if let item = entry.items.first {
                    HeroCardView(item: item, lastFetchDate: entry.lastFetchDate, showsWidgetPadding: showsWidgetPadding)
                } else {
                    EmptyStateView()
                }
            } else if family == .systemMedium {
                // Medium: Two Hero Cards Side-by-Side
                if entry.items.isEmpty {
                    EmptyStateView()
                } else {
                    HStack(spacing: 0) {
                        if let first = entry.items.first {
                            HeroCardView(item: first, lastFetchDate: entry.lastFetchDate, showsWidgetPadding: showsWidgetPadding)
                                .padding(.trailing, 4)
                        }
                        
                        Divider().background(Color.white.opacity(0.1))
                        
                        if entry.items.count > 1 {
                            HeroCardView(item: entry.items[1], lastFetchDate: entry.lastFetchDate, showsWidgetPadding: showsWidgetPadding)
                                .padding(.leading, 12)
                        } else {
                            // Placeholder for 2nd slot balance
                            Spacer().frame(maxWidth: .infinity)
                        }
                    }
                }
            } else {
                // Large: List Layout
                VStack(spacing: 0) {
                    // Header
                    HStack {
                        Spacer()
                        if entry.items.isEmpty {
                            Text("NYC Commute")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.gray)
                        } else {
                            let diff = entry.date.timeIntervalSince(entry.lastFetchDate)
                            let mins = Int(diff / 60)
                            let timeText = mins == 0 ? "Now" : "\(mins)m"
                            Text("Updated \(timeText)")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.gray.opacity(0.8))
                                .multilineTextAlignment(.trailing)
                        }
                    }
                    .padding(.bottom, 4)
                    
                    if entry.items.isEmpty {
                        EmptyStateView()
                    } else {
                        VStack(spacing: 8) {
                            ForEach(Array(entry.items.prefix(5).enumerated()), id: \.offset) { index, item in
                                HStack(alignment: .center, spacing: 8) {
                                    ZStack {
                                        if item.mode == "subway" {
                                            Circle().fill(colorForRoute(item.routeId ?? "", mode: item.mode))
                                        } else {
                                            RoundedRectangle(cornerRadius: 6).fill(colorForRoute(item.routeId ?? "", mode: item.mode))
                                        }
                                        Text(formatRouteId(item.routeId ?? "?"))
                                            .font(.system(size: 14, weight: .bold))
                                            .minimumScaleFactor(0.5)
                                            .foregroundColor(.white)
                                    }
                                    .frame(width: 32, height: 32)
                                    .shadow(color: .black.opacity(0.2), radius: 2, x: 0, y: 1)
                                    
                                    VStack(alignment: .leading, spacing: 1) {
                                        HStack {
                                            Text(item.nickname ?? item.label).font(.system(size: 14, weight: .semibold)).foregroundColor(.white).lineLimit(1)
                                            Spacer()
                                            if let etas = item.etas, let first = etas.first {
                                                Text(first.replacingOccurrences(of: " min", with: "")).font(.system(size: 18, weight: .bold)).foregroundColor(first == "--" ? .gray : Color(hex: "4ADE80")) +
                                                Text(first == "--" ? "" : " min").font(.system(size: 12, weight: .medium)).foregroundColor(first == "--" ? .gray : Color(hex: "4ADE80"))
                                            } else {
                                                Text("--").font(.system(size: 16, weight: .bold)).foregroundColor(.gray)
                                            }
                                        }
                                        HStack {
                                            Text(item.destinationName ?? "").font(.system(size: 11, weight: .medium)).foregroundColor(.gray).lineLimit(1)
                                            Spacer()
                                            if let etas = item.etas, etas.count > 1 {
                                                Text(etas.dropFirst().prefix(2).map{ $0.replacingOccurrences(of: " min", with: "") }.joined(separator: ", ")).font(.system(size: 11, weight: .medium)).foregroundColor(.gray)
                                            }
                                        }
                                    }
                                }
                                if index < min(entry.items.count, 5) - 1 {
                                    Divider().background(Color.white.opacity(0.1))
                                }
                            }
                        }
                    }
                    Spacer()
                }
                .padding(showsWidgetPadding ? 12 : 0)
            }
        }
    }
}

struct EmptyStateView: View {
    var body: some View {
        VStack {
            Spacer()
            Text("No Routes")
                .font(.subheadline)
                .foregroundColor(.gray)
            Text("Add in App")
                .font(.caption)
                .foregroundColor(.gray.opacity(0.8))
            Spacer()
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
                    HStack(spacing: 4) {
                        Text(etas.prefix(3).map { $0.replacingOccurrences(of: " min", with: "") }.joined(separator: ", ") + " min")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                        
                        // Live Indicator
                        if etas.first != "--" {
                            Image(systemName: "bolt.fill")
                                .font(.system(size: 10))
                                .foregroundColor(.white.opacity(0.8))
                            Text("Live")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(.white.opacity(0.8))
                                .offset(x: -2)
                        }
                    }
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
