import { parseObservableLocation } from "./game-log/location";
import type { VrchatGroupInstance } from "./vrchat/types";

export function isGroupInstanceFor(instance: VrchatGroupInstance, groupId: string) {
    const location = parseObservableLocation(instance.location);
    return instance.ownerId === groupId && instance.worldId === instance.world.id && location?.worldId === instance.worldId && location.groupId === groupId;
}
