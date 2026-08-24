import { z } from "zod";

import { formatFavoriteCsv } from "@/lib/favorites-transfer";
import { vrchatAvatarSchema } from "@/lib/vrchat/types";

export const ownedAvatarsPageSchema = z.object({ avatars: z.array(vrchatAvatarSchema) }).strict();

export type ExportFriend = {
    id: string;
    displayName: string;
    statusDescription?: string;
    bio?: string;
    memo?: string;
};

export type ExportAvatar = {
    id: string;
    name: string;
};

export function formatFriendsListExports(friends: ExportFriend[]) {
    return {
        csv: formatFavoriteCsv(
            ["UserID", "DisplayName", "Memo"],
            friends.map((friend) => ({ UserID: friend.id, DisplayName: friend.displayName, Memo: (friend.memo || "").replace(/[\r\n]+/g, " ") })),
        ),
        json: JSON.stringify({ friends: friends.map((friend) => friend.id) }, null, 4),
    };
}

export function formatOwnedAvatarsCsv(avatars: ExportAvatar[]) {
    return formatFavoriteCsv(
        ["AvatarID", "AvatarName"],
        avatars.map((avatar) => ({ AvatarID: avatar.id, AvatarName: avatar.name })),
    );
}

export function formatDiscordNamesCsv(friends: ExportFriend[]) {
    const rows = friends.flatMap((friend) => {
        const match = /(?:discord|dc|dis)(?: |=|:|˸|;)(.*)/i.exec(friend.statusDescription || "") || /(?:discord|dc|dis)(?: |=|:|˸|;)(.*)/i.exec(friend.bio || "");
        const discordName = match?.[1]?.trim();
        return discordName ? [{ DisplayName: friend.displayName, DiscordName: discordName }] : [];
    });
    return formatFavoriteCsv(["DisplayName", "DiscordName"], rows);
}
