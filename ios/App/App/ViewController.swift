import UIKit
import Capacitor

class ViewController: CAPBridgeViewController {
    
    override func capacitorDidLoad() {
        // Manually register the plugin instance
        let plugin = NYCBridgeImpl()
        self.bridge?.registerPluginInstance(plugin)
        print("⚡️⚡️⚡️ [Manual Reg] NYCBridgeImpl registered manually! ⚡️⚡️⚡️")
    }
    
}
