import UIKit
import Capacitor

class BridgeViewController: CAPBridgeViewController {
    
    override func capacitorDidLoad() {
        print("⚡️⚡️⚡️ [BridgeVC] capacitorDidLoad - Bridge is READY! ⚡️⚡️⚡️")
        
        // Manually register the plugin to guarantee it's available
        let plugin = NYCBridgeImpl()
        self.bridge?.registerPluginInstance(plugin)
        print("⚡️⚡️⚡️ [BridgeVC] NYCBridgeImpl registered manually! ⚡️⚡️⚡️")
    }
    
}
