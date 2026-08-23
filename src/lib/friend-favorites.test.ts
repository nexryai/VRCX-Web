import { describe, expect, test } from "vitest";

import { selectFavoriteFriendIds } from "./friend-favorites";

const remote = [
    { favoriteId: "usr_one", type: "friend", tags: ["group_0"] },
    { favoriteId: "usr_two", type: "friend", tags: ["group_1"] },
    { favoriteId: "avtr_ignored", type: "avatar", tags: ["group_0"] },
];

describe("favorite friend group filtering", () => {
    test("includes every remote friend group when no remote group is selected", () => {
        expect(selectFavoriteFriendIds(remote, ["usr_local"], [])).toEqual(["usr_local", "usr_one", "usr_two"]);
        expect(selectFavoriteFriendIds(remote, ["usr_local"], ["local:lfg_00000000-0000-0000-0000-000000000001"])).toEqual(["usr_local", "usr_one", "usr_two"]);
    });

    test("restricts remote favorites to selected VRCX group keys and always retains local favorites", () => {
        expect(selectFavoriteFriendIds(remote, ["usr_local", "usr_one"], ["friend:group_1"])).toEqual(["usr_local", "usr_one", "usr_two"]);
        expect(selectFavoriteFriendIds(remote, ["usr_local"], ["friend:group_1"])).toEqual(["usr_local", "usr_two"]);
    });
});
