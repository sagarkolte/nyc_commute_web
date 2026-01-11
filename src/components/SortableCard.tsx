import { useDragControls, Reorder } from "framer-motion";
import { CountdownCard } from "./CountdownCard";
import { CommuteTuple } from "@/types";

interface Props {
    item: CommuteTuple;
    onDelete: () => void;
}

export const SortableCard = ({ item, onDelete }: Props) => {
    const dragControls = useDragControls();

    return (
        <Reorder.Item
            value={item}
            dragListener={false}
            dragControls={dragControls}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileDrag={{ scale: 1.08, boxShadow: "0 16px 32px rgba(0,0,0,0.3)", zIndex: 10 }}
            onDragStart={() => {
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate(50);
                }
            }}
            style={{ position: 'relative' }} // ensure context
        >
            <CountdownCard tuple={item} onDelete={onDelete} dragControls={dragControls} />
        </Reorder.Item>
    );
};
