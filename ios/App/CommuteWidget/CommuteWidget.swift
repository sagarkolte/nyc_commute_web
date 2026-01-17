//
//  CommuteWidget.swift
//  App
//
//  Created by Sagar Kolte on 1/17/26.
//
import WidgetKit
import SwiftUI
// MARK: - Data Models
struct CommuteTuple: Codable, Identifiable {
    let id: String
    let label: String
    let mode: String
    let routeId: String?
    let stopId: String?
    let direction: String?
    let destinationName: String?
    let etas: [String]?
}
// MARK: - Provider
struct Provider: TimelineProvider {
    // MUST MATCH XCODE SIGNING CAPABILITY
    let groupName = "group.com.antigravity.nyccommute"
    
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), items: [])
    }
    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let items = loadItems()
        let entry = SimpleEntry(date: Date(), items: items)
        completion(entry)
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        let items = loadItems()
        let refreshDate = Calendar.current.date(byAdding: .minute, value: 5, to: Date())!
        let entry = SimpleEntry(date: Date(), items: items)
        let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
        completion(timeline)
    }
    
    func loadItems() -> [CommuteTuple] {
        print("🔍 Widget: Attempting to load from Group: \(groupName)")
        
        guard let userDefaults = UserDefaults(suiteName: groupName) else {
            print("❌ Widget: Could NOT access App Group UserDefaults")
            return []
        }
        
        guard let jsonString = userDefaults.string(forKey: "widgetData") else {
            print("⚠️ Widget: No 'widgetData' key found in UserDefaults")
            return []
        }
        
        print("📄 Widget: Found JSON data (Length: \(jsonString.count))")
        // print("📄 Content: \(jsonString)") // Uncomment if needed (privacy)
        
        guard let data = jsonString.data(using: .utf8) else {
            print("❌ Widget: Failed to convert string to data")
            return []
        }
        
        do {
            let items = try JSONDecoder().decode([CommuteTuple].self, from: data)
            print("✅ Widget: Successfully decoded \(items.count) items")
            return Array(items.prefix(2))
        } catch {
            print("❌ Widget: JSON Decode Error: \(error)")
            return []
        }
    }
}
struct SimpleEntry: TimelineEntry {
    let date: Date
    let items: [CommuteTuple]
}
// MARK: - Widget View
struct CommuteWidgetEntryView : View {
    var entry: Provider.Entry
    
    var body: some View {
        ZStack {
            // Global Background
            Color(hex: "000000").edgesIgnoringSafeArea(.all)
            
            VStack(spacing: 12) {
                if entry.items.isEmpty {
                    Text("Add routes in App")
                        .font(.caption)
                        .foregroundStyle(.gray)
                } else {
                    ForEach(entry.items) { item in
                        HStack(spacing: 0) {
                            // Colored Left Border
                            Rectangle()
                                .fill(colorForRoute(item.routeId ?? "", mode: item.mode))
                                .frame(width: 6)
                            
                            // Content
                            HStack(alignment: .center, spacing: 12) {
                                // Badge
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
                                        .foregroundColor(.white)
                                }
                                .frame(width: 24, height: 24)
                                
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.label)
                                        .font(.system(size: 14, weight: .bold)) // Slightly larger title
                                        .lineLimit(1)
                                        .foregroundColor(.white)
                                    
                                    if let etas = item.etas, !etas.isEmpty {
                                        Text(etas.joined(separator: ", "))
                                            .font(.system(size: 12, weight: .medium)) // Medium weight for visibility
                                            .foregroundColor(Color(hex: "4ADE80")) // Green for times (Tailwind green-400)
                                            .lineLimit(1)
                                    } else {
                                        Text("Loading...")
                                            .font(.caption)
                                            .foregroundColor(.gray)
                                    }
                                }
                                Spacer()
                            }
                            .padding(.vertical, 10)
                            .padding(.horizontal, 10)
                        }
                        .background(Color(hex: "1C1C1E")) // Card Background
                        .cornerRadius(8)
                        .clipShape(RoundedRectangle(cornerRadius: 8)) // Ensure border clips
                    }
                }
            }
            .padding(12)
        }
    }
    
    func formatRouteId(_ id: String) -> String {
        return id.replacingOccurrences(of: "MTA NYCT_", with: "")
                 .replacingOccurrences(of: "MTABC_", with: "")
                 .replacingOccurrences(of: "-SBS", with: "")
    }
    
    func colorForRoute(_ routeId: String, mode: String) -> Color {
        let r = routeId.replacingOccurrences(of: "MTA NYCT_", with: "")
        
        // Subway Colors
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
        case "SI": return Color(hex: "0039A6") // SIR
        default: break
        }
        
        // Mode Fallbacks
        switch mode {
        case "lirr": return Color(hex: "0039A6") // Blue
        case "mnr": return Color(hex: "E00034") // Red
        case "njt": return Color(hex: "F7941D") // Orange
        case "bus": return Color(hex: "0039A6") // Blue
        default: return .gray
        }
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
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
// MARK: - Main Widget Config
@main
struct CommuteWidget: Widget {
    let kind: String = "CommuteWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                CommuteWidgetEntryView(entry: entry)
                    .containerBackground(Color.black, for: .widget) // Force Black
            } else {
                CommuteWidgetEntryView(entry: entry)
                    .padding()
                    .background(Color.black)
            }
        }
        .configurationDisplayName("Commute Tracker")
        .description("View your top commutes.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}
