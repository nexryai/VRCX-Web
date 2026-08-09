import { z } from "zod";

import { trustLevelFromTags } from "./activity-log";
import { vrchatUserSchema } from "./vrchat/types";

export const friendListSearchFields = ["Display Name", "User Name", "Rank", "Status", "Bio", "Note", "Memo"] as const;
export type FriendListSearchField = (typeof friendListSearchFields)[number];

export const defaultFriendListSearchFields = ["Display Name", "Rank", "Status", "Bio", "Note", "Memo"] as const satisfies readonly FriendListSearchField[];

export const friendListUserSchema = vrchatUserSchema.extend({ $memo: z.string().default("") });
export type FriendListUser = z.infer<typeof friendListUserSchema>;

export const friendListResponseSchema = z.object({ friends: z.array(friendListUserSchema) }).strict();

export function friendMatchesSearch(friend: FriendListUser, rawQuery: string, selectedFields: readonly FriendListSearchField[]) {
    const query = rawQuery.trim().toLocaleLowerCase();
    if (!query) return true;
    const fields = selectedFields.length ? selectedFields : defaultFriendListSearchFields;
    const valueFor = (field: FriendListSearchField) => {
        if (field === "Display Name") return friend.displayName;
        if (field === "User Name") return friend.username || "";
        if (field === "Rank") return trustLevelFromTags(friend.tags);
        if (field === "Status") return friend.statusDescription || "";
        if (field === "Bio") return friend.bio || "";
        if (field === "Note") return friend.note || "";
        return friend.$memo;
    };
    return fields.some((field) => valueFor(field).toLocaleLowerCase().includes(query));
}
