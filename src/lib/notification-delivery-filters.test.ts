import { describe, expect, it } from "vitest";

import { defaultNotificationDeliveryFilters, notificationDeliveryFiltersSchema, shouldDeliverFilteredEvent } from "./notification-delivery-filters";

describe("notification delivery filters", () => {
    it("preserves VRCX defaults for remote-observable events", () => {
        expect(notificationDeliveryFiltersSchema.safeParse(defaultNotificationDeliveryFilters).success).toBe(true);
        expect(defaultNotificationDeliveryFilters).toMatchObject({ Online: "VIP", GPS: "Off", invite: "Friends", friendRequest: "On", "group.joinRequest": "Off" });
    });

    it("applies VRCX relationship levels", () => {
        expect(shouldDeliverFilteredEvent("Off", { isFriend: true, isFavorite: true })).toBe(false);
        expect(shouldDeliverFilteredEvent("On", { isFriend: false, isFavorite: false })).toBe(true);
        expect(shouldDeliverFilteredEvent("Everyone", { isFriend: false, isFavorite: false })).toBe(true);
        expect(shouldDeliverFilteredEvent("Friends", { isFriend: true, isFavorite: false })).toBe(true);
        expect(shouldDeliverFilteredEvent("Friends", { isFriend: false, isFavorite: true })).toBe(false);
        expect(shouldDeliverFilteredEvent("VIP", { isFriend: true, isFavorite: true })).toBe(true);
        expect(shouldDeliverFilteredEvent("VIP", { isFriend: true, isFavorite: false })).toBe(false);
    });

    it("rejects incomplete or unknown filter maps", () => {
        expect(notificationDeliveryFiltersSchema.safeParse({ invite: "Friends" }).success).toBe(false);
        expect(notificationDeliveryFiltersSchema.safeParse({ ...defaultNotificationDeliveryFilters, invite: "Unknown" }).success).toBe(false);
        expect(notificationDeliveryFiltersSchema.safeParse({ ...defaultNotificationDeliveryFilters, VideoPlay: "On" }).success).toBe(false);
    });
});
