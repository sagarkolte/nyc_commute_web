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
    
    func fetchLocation() async -> CLLocation? {
        // Ensure we are on main thread for CoreLocation safety if needed, 
        // though requestLocation is thread-safe, the delegate callbacks happen on run loop.
        // We wrap in continuation to await the result.
        return await withCheckedContinuation { continuation in
            // Handle edge case: if already executing? We assume serial widget usage.
            self.continuation = continuation
            
            if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
                manager.requestLocation()
            } else {
                resume(with: nil)
            }
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
            
            // Parallel Fetch using Async/Await
            async let locationFetch = locationManager.fetchLocation()
            async let networkFetch = fetchBatchData(items: items)
            
            // Wait for both (non-blocking to the thread)
            let (currentLocation, networkResults) = await (locationFetch, networkFetch)
            
            var updatedEtas: [String: [String]] = [:]
            var updatedArrivals: [String: [Double]] = [:]
            
            if let results = networkResults {
                for (id, res) in results {
                    updatedEtas[id] = res.etas
                    updatedArrivals[id] = res.arrivals
                }
            }
            
            // Merge Data
            var mergedItems: [CommuteTuple] = []
            
            for item in items {
                let freshEtas = updatedEtas[item.id] ?? item.etas
                let freshArrivals = updatedArrivals[item.id]
                
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
                    lat: freshArrivals != nil ? (item.lat) : item.lat,
                    lon: item.lon
                )
                mergedItems.append(newItem)
            }
            
            // Auto-Sort
            if let loc = currentLocation {
                mergedItems.sort { (a, b) -> Bool in
                    guard let latA = a.lat, let lonA = a.lon,
                          let latB = b.lat, let lonB = b.lon else {
                        if a.lat != nil { return true }
                        return false
                    }
                    let locA = CLLocation(latitude: latA, longitude: lonA)
                    let locB = CLLocation(latitude: latB, longitude: lonB)
                    return loc.distance(from: locA) < loc.distance(from: locB)
                }
            }
            
            // Generate Timeline
            var entries: [SimpleEntry] = []
            let currentDate = Date()
            
            for minuteOffset in 0..<15 {
                let entryDate = Calendar.current.date(byAdding: .minute, value: minuteOffset, to: currentDate)!
                
                // Recalculate ETAs
                let dynamicItems = mergedItems.map { item -> CommuteTuple in
                    guard let arrivals = updatedArrivals[item.id], !arrivals.isEmpty else {
                        return item
                    }
                    
                    let etas = arrivals.compactMap { ts -> String? in
                        let diff = ts - entryDate.timeIntervalSince1970
                        if diff < -30 { return nil }
                        let mins = max(0, Int(floor(diff / 60)))
                        return "\(mins) min"
                    }
                    
                    return CommuteTuple(
                        id: item.id, label: item.label, mode: item.mode, routeId: item.routeId, stopId: item.stopId,
                        direction: item.direction, destinationName: item.destinationName, destinationStopId: item.destinationStopId,
                        etas: etas.isEmpty ? ["--"] : Array(etas.prefix(3)),
                        nickname: item.nickname, lat: item.lat, lon: item.lon
                    )
                }
                
                entries.append(SimpleEntry(date: entryDate, items: dynamicItems, lastFetchDate: currentDate))
            }
            
            let timeline = Timeline(entries: entries, policy: .atEnd)
            completion(timeline)
        }
    }
    
    func fetchBatchData(items: [CommuteTuple]) async -> [String: BatchResult]? {
        guard !items.isEmpty else { return nil }
        guard let url = URL(string: backendUrl) else { return nil }
        
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
            
            let (data, _) = try await URLSession.shared.data(for: request)
            let decoded = try JSONDecoder().decode(BatchResponse.self, from: data)
            print("✅ Widget: Fetched Batch Data: \(decoded.results.count) items")
            return decoded.results
        } catch {
            print("❌ Widget: Network/Decode Error: \(error)")
            return nil
        }
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
    let lastFetchDate: Date // Added for "Updated x mins ago"
}

// MARK: - Views
// (Views remain largely unchanged, but we can remove formatting logic if we trust backend)

struct CommuteWidgetEntryView : View {
    var entry: SimpleEntry
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
                    .font(.system(size: 18, weight: .bold)) // Reduced from 20
                    .minimumScaleFactor(0.4)
                    .lineLimit(1)
                    .foregroundColor(.white)
                    .padding(.horizontal, 4)
            }
            .frame(width: 48, height: 48) // Reduced from 56
            .padding(.top, 4)
            .padding(.bottom, 8) // Reduced from 12
            
            // Route Label
            Text(item.nickname ?? item.label)
                .font(.system(size: 14, weight: .semibold)) // Reduced from 16
                .foregroundColor(.white)
                .lineLimit(1)
                .padding(.bottom, 2)
            
            // ETAs
            if let etas = item.etas, !etas.isEmpty {
                Text(etas.prefix(3).map { $0.replacingOccurrences(of: " min", with: "") }.joined(separator: ", ") + " Min")
                    .font(.system(size: 18, weight: .bold)) // Reduced from 20
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                    .foregroundColor(etas.first == "--" ? .gray : .white)
            } else {
                Text("--")
                    .font(.system(size: 20, weight: .bold))
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
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SystemView: View {
    var entry: SimpleEntry
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
        ZStack {
            // Background
            Color(hex: "1C1C1E").edgesIgnoringSafeArea(.all)
            
            if family == .systemSmall {
                if let item = entry.items.first {
                    HeroCardView(item: item, lastFetchDate: entry.lastFetchDate)
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
                            HeroCardView(item: first, lastFetchDate: entry.lastFetchDate)
                        }
                        
                        Divider().background(Color.white.opacity(0.1))
                        
                        if entry.items.count > 1 {
                            HeroCardView(item: entry.items[1], lastFetchDate: entry.lastFetchDate)
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
                .padding(12)
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
