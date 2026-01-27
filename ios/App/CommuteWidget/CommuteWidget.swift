//
//  CommuteWidget.swift
//  App
//
//  Created by Sagar Kolte on 1/17/26.
//
import WidgetKit
import SwiftUI

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
