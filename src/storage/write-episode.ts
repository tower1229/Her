import * as fs from "fs";
import * as path from "path";
import { WorldHooks } from "../lib/types";
import { getHoliday } from "../lib/holidays";
import { appendRunLog } from "./run-log";
import {
  dayOfWeek,
  formatDate,
  formatTime,
  parseTimestampParts,
} from "../lib/time-utils";

export interface WriteEpisodeInput {
  timestamp: string; // ISO string e.g., 2026-03-22T14:30:00+08:00
  location: string;
  action: string;
  emotionTags: string[];
  appearance: string;
  internalMonologue?: string;
  naturalText?: string;
  filePath: string;
  windowPreset?: string; // e.g., "now_today" for run-log
  confidence?: number;
}

export interface WriteResult {
  success: boolean;
  written_at: string;
  world_hooks?: WorldHooks;
  error?: string;
}

export async function writeEpisode(
  input: WriteEpisodeInput,
): Promise<WriteResult> {
  const {
    timestamp,
    location,
    action,
    emotionTags,
    appearance,
    internalMonologue,
    naturalText,
    filePath,
  } = input;

  // 1. Validation
  if (
    !timestamp ||
    !location ||
    !action ||
    !emotionTags ||
    emotionTags.length === 0 ||
    !appearance
  ) {
    return { success: false, written_at: "", error: "Missing required fields" };
  }

  try {
    const timestampParts = parseTimestampParts(timestamp);
    const dateObj = timestampParts ? null : new Date(timestamp);
    if (!timestampParts && (!dateObj || isNaN(dateObj.getTime()))) {
      return {
        success: false,
        written_at: "",
        error: "Invalid timestamp format",
      };
    }

    const yyyy = timestampParts ? timestampParts.year : dateObj!.getFullYear();
    const mm = String(
      timestampParts ? timestampParts.month : dateObj!.getMonth() + 1,
    ).padStart(2, "0");
    const dd = String(
      timestampParts ? timestampParts.day : dateObj!.getDate(),
    ).padStart(2, "0");
    const dateStr = timestampParts
      ? formatDate(timestampParts)
      : `${yyyy}-${mm}-${dd}`;

    const timeStr = timestampParts
      ? formatTime(timestampParts)
      : `${String(dateObj!.getHours()).padStart(2, "0")}:${String(dateObj!.getMinutes()).padStart(2, "0")}:${String(dateObj!.getSeconds()).padStart(2, "0")}`;

    // 2. World hooks
    const isWeekend = timestampParts
      ? [0, 6].includes(dayOfWeek(timestampParts))
      : dateObj!.getDay() === 0 || dateObj!.getDay() === 6;
    const weekday = !isWeekend;
    const holidayKey = getHoliday(`${yyyy}-${mm}-${dd}`);

    const worldHooks: WorldHooks = {
      weekday,
      holiday_key: holidayKey,
    };

    // 3. Format markdown
    const mdLines = [
      `### [${timeStr}] ${action.substring(0, 15)}...`,
      "",
      `- Timestamp: ${dateStr} ${timeStr}`,
      `- Location: ${location}`,
      `- Action: ${action}`,
      `- Emotion_Tags: [${emotionTags.join(", ")}]`,
      `- Appearance: ${appearance}`,
    ];

    if (internalMonologue) {
      mdLines.push(`- Internal_Monologue: ${internalMonologue}`);
    }

    mdLines.push("");

    if (naturalText) {
      mdLines.push(naturalText);
      mdLines.push("");
    }

    const mdContent = mdLines.join("\n") + "\n";

    // 4. Write
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.appendFileSync(filePath, mdContent, "utf8");

    const writtenAt = new Date().toISOString();

    // Append run log (T4.2)
    const logPath = path.join(dir, ".timeline-run.log");
    appendRunLog(
      {
        ts: writtenAt,
        date: dateStr,
        mode: "generated_new",
        episodes_written: 1,
        window: input.windowPreset || "unknown",
        confidence: input.confidence ?? 1.0,
      },
      logPath,
    );

    return {
      success: true,
      written_at: writtenAt,
      world_hooks: worldHooks,
    };
  } catch (error: any) {
    return { success: false, written_at: "", error: error.message };
  }
}
