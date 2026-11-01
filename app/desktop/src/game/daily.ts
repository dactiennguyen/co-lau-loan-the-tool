import type { DailyQuest } from "@/api/types";

/** "Thu thập 218/2100 xu khóa từ đánh quái", as the Phụ tab of the game draws it (mail::DailyQuest::text). */
export const dailyText = (q: DailyQuest) => q.template.replace("%d", `${q.progress}/${q.target}`);
/** Enough for Hoàn thành nhiệm vụ. */
export const dailyDone = (q: DailyQuest) => q.progress >= q.target;
