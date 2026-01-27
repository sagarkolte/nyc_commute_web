import Foundation
import WatchConnectivity

class WatchConnector: NSObject, WCSessionDelegate {
    static let shared = WatchConnector()
    
    private override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }
    
    public func sendData(json: String) {
        guard WCSession.isSupported() && WCSession.default.isPaired else { return }
        
        do {
            let context = ["widgetData": json]
            try WCSession.default.updateApplicationContext(context)
            print("⌚️ WatchConnector: Sent context update")
        } catch {
            print("❌ WatchConnector: Error sending data: \(error)")
        }
    }
    
    // MARK: - WCSessionDelegate Methods
    
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        print("⌚️ WatchConnector: Message: \(activationState.rawValue)")
        print("⌚️ WatchConnector: Paired: \(session.isPaired), Installed: \(session.isWatchAppInstalled)")
    }
    
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }
}
