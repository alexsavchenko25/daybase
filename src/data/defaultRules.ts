// "Rules + key habits" + "Sunday review checklist" aus dem Original-HTML.
// Werden als note-Entries mit Tag "weekly-rules" geseedet, damit sie nicht
// verloren gehen.
export interface DefaultNote {
  title: string;
  lines: string[];
}

export const WEEKLY_RULES_TAG = "weekly-rules";

export const DEFAULT_RULES: DefaultNote[] = [
  {
    title: "Morning rules",
    lines: [
      "No phone for first 30 min",
      "Clipping starts before 08:00",
      "All 3 videos scheduled by 11:00",
      "Never start with social media",
    ],
  },
  {
    title: "Trading rules",
    lines: [
      "Prep 30 min before open, always",
      "Journal every trade, no exceptions",
      "No revenge trades after a loss",
      "Review weekly P&L on Sunday",
    ],
  },
  {
    title: "Learning rules",
    lines: [
      "Apply before you consume more",
      "One skill focus per week",
      "Track what you implement",
      'No passive watching as "learning"',
    ],
  },
  {
    title: "Recovery rules",
    lines: [
      "Screens off by 22:30 daily",
      "Protect Sunday afternoon always",
      "Never skip calisthenics two days in a row",
      "Real breaks = no phone",
    ],
  },
  {
    title: "Sunday review checklist",
    lines: [
      "Did I post 18+ videos this week? (3/day × 6 days)",
      "Did I trade every day with a pre-plan?",
      "Did I journal every trade?",
      "What was my best-performing video and why?",
      "What skill did I work on — and did I actually apply it?",
      "Where did I waste time or break the schedule?",
      "What's the ONE focus for next week?",
    ],
  },
];
