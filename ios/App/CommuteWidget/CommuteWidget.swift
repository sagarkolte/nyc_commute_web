//
//  CommuteWidget.swift
//  App
//
//  Created by Sagar Kolte on 1/17/26.
//
import WidgetKit
import SwiftUI

@main
struct CommuteWidgetBundle: WidgetBundle {
    var body: some Widget {
        CommuteWidget()
        
        if #available(iOS 16.1, *) {
            CommuteWidgetLiveActivity()
        }
    }
}

struct CommuteWidget: Widget {
    let kind: String = "CommuteWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                CommuteWidgetEntryView(entry: entry)
                    .containerBackground(Color(hex: "1C1C1E"), for: .widget)
            } else {
                CommuteWidgetEntryView(entry: entry)
                    .background(Color(hex: "1C1C1E"))
            }
        }
        .configurationDisplayName("Commute Tracker")
        .description("View your top commutes.")
        .supportedFamilies(supportedFamilies())
    }
    
    private func supportedFamilies() -> [WidgetFamily] {
        if #available(iOS 16.0, *) {
            return [.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline]
        } else {
            return [.systemSmall, .systemMedium]
        }
    }
}
