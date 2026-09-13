"use client";

import { useDateTimeSettings } from "@/components/appearance-settings-provider";
import { formatVrcxDate, type VrcxDateFormat } from "@/lib/date-format";

export function VrcxDate({ value, format = "long" }: { value: string | Date | null | undefined; format?: VrcxDateFormat }) {
    return <>{formatVrcxDate(value, format, useDateTimeSettings())}</>;
}
