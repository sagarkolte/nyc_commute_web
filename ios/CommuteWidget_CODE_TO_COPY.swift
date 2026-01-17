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
}

// MARK: - API Response Models
struct BusResponse: Codable {
    let routes: [BusRoute]? // Simplified
}
// We will parse raw JSON for flexibility as the API structure varies by mode

struct SimpleDeparture {
    let time: String
    let status: String
}

// MARK: - Provider
struct Provider: TimelineProvider {
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
        
        // Refresh every 5 minutes
        let refreshDate = Calendar.current.date(byAdding: .minute, value: 5, to: Date())!
        
        let entry = SimpleEntry(date: Date(), items: items)
        let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
        completion(timeline)
    }
    
    func loadItems() -> [CommuteTuple] {
        guard let userDefaults = UserDefaults(suiteName: groupName),
              let jsonString = userDefaults.string(forKey: "widgetData"),
              let data = jsonString.data(using: .utf8) else {
            return []
        }
        
        do {
            let items = try JSONDecoder().decode([CommuteTuple].self, from: data)
            return Array(items.prefix(2)) // Only first 2 items
        } catch {
            print("Widget Decode Error: \(error)")
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
        VStack(spacing: 8) {
            if entry.items.isEmpty {
                Text("Add routes in App")
                    .font(.caption)
                    .foregroundColor(.gray)
            } else {
                ForEach(entry.items) { item in
                    HStack {
                        Circle()
                            .fill(colorForMode(item.mode))
                            .frame(width: 12, height: 12)
                        
                        VStack(alignment: .leading) {
                            Text(item.label)
                                .font(.system(size: 12, weight: .bold))
                                .lineLimit(1)
                            if let dest = item.destinationName {
                                Text(dest)
                                    .font(.caption2)
                                    .foregroundColor(.gray)
                                    .lineLimit(1)
                            }
                        }
                        Spacer()
                    }
                    .padding(4)
                    .background(Color(UIColor.systemGray6))
                    .cornerRadius(8)
                }
            }
        }
        .padding()
    }
    
    func colorForMode(_ mode: String) -> Color {
        switch mode {
        case "subway": return .blue
        case "bus": return .blue
        case "lirr": return .yellow
        case "mnr": return .red
        case "njt": return .orange
        case "path": return .green
        default: return .gray
        }
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
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                CommuteWidgetEntryView(entry: entry)
                    .padding()
                    .background()
            }
        }
        .configurationDisplayName("Commute Tracker")
        .description("View your top commutes.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}
