import { registerPlugin } from '@capacitor/core';

export interface WidgetDataPlugin {
    updateData(options: { json: string }): Promise<void>;
    updateEtas(options: { json: string }): Promise<void>;
    reloadTimeline(): Promise<void>;
    echo(options: { value: string }): Promise<{ value: string }>;
}

const WidgetData = registerPlugin<WidgetDataPlugin>('CommuteWidget');

export default WidgetData;
