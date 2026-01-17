#import <Capacitor/Capacitor.h>

@class NYCBridgeImpl;

// Debug to verify ObjC file is loaded
__attribute__((constructor)) static void widgetDataConstructor(void) {
  printf("⚡️⚡️⚡️ [ObjC] WidgetData.m Loaded! ⚡️⚡️⚡️\n");
}

CAP_PLUGIN(NYCBridgeImpl, "CommuteWidget",
           CAP_PLUGIN_METHOD(updateData, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(reloadTimeline, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(echo, CAPPluginReturnPromise);)
