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
        CommuteWidgetLegacy()
        
        if #available(iOS 17.0, *) {
            CommuteWidgetModern()
        }
        
        if #available(iOS 16.1, *) {
            CommuteWidgetLiveActivity()
        }
    }
}

@available(iOS 17.0, *)
struct CommuteWidgetModern: Widget {
    let kind: String = "CommuteWidgetModern"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            CommuteWidgetEntryView(entry: entry, showsWidgetPadding: true)
        }
        .configurationDisplayName("Commute Tracker")
        .description("View your top commutes.")
        .supportedFamilies(supportedFamilies())
        .contentMarginsDisabled()
    }
    
    private func supportedFamilies() -> [WidgetFamily] {
        return [.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline]
    }
}

struct CommuteWidgetLegacy: Widget {
    let kind: String = "CommuteWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            CommuteWidgetEntryView(entry: entry, showsWidgetPadding: false)
        }
        .configurationDisplayName("Commute Tracker")
        .description("View your top commutes.")
        .supportedFamilies(supportedFamilies())
    }
    
    private func supportedFamilies() -> [WidgetFamily] {
        if #available(iOSApplicationExtension 16.0, *) {
            return [.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline]
        } else {
            return [.systemSmall, .systemMedium]
        }
    }
}
