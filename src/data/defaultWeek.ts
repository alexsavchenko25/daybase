import type { CategoryId } from "./weekplanCategories";

// Default-Woche = Startzustand ("weekly lock-in schedule"). 1:1 aus dem
// Original-HTML übernommen. Nur Seed-Daten — keine UI-Hardcodes.
// day: 0 = Montag .. 6 = Sonntag.
export interface DefaultBlock {
  day: number;
  startTime: string;
  endTime: string;
  category: CategoryId;
  title: string;
  note: string;
}

type Block = Omit<DefaultBlock, "day">;

// Standard-Werktag (Mo/Di/Do identisch im Original).
const STD_DAY: Block[] = [
  {
    startTime: "07:00",
    endTime: "07:30",
    category: "morning",
    title: "Wake up + morning routine",
    note: "No phone. Water, quick prep, get your head right.",
  },
  {
    startTime: "07:30",
    endTime: "09:30",
    category: "clipping",
    title: "Clipping session 1 — deep work",
    note: "Find, cut and edit all 3 videos for the day. No interruptions.",
  },
  {
    startTime: "09:30",
    endTime: "10:00",
    category: "break",
    title: "Break + meal 1",
    note: "Eat, step outside, reset. No scrolling.",
  },
  {
    startTime: "10:00",
    endTime: "11:00",
    category: "clipping",
    title: "Clipping session 2 — finish + schedule",
    note: "Final edits, captions, thumbnails. Schedule all 3 posts.",
  },
  {
    startTime: "11:00",
    endTime: "13:00",
    category: "learning",
    title: "Learning block — video/content growth",
    note: "Study editing, hooks, algo, analytics. Apply, don't just consume.",
  },
  {
    startTime: "13:00",
    endTime: "13:30",
    category: "break",
    title: "Lunch + real break",
    note: "Step away from the screen completely.",
  },
  {
    startTime: "13:30",
    endTime: "15:00",
    category: "calisthenics",
    title: "Calisthenics (40 min) + shower",
    note: "40 min workout, then clean up. Done by 15:00.",
  },
  {
    startTime: "15:00",
    endTime: "15:30",
    category: "trading",
    title: "Pre-market prep",
    note: "Charts, watchlist, plan your trades. No winging it.",
  },
  {
    startTime: "15:30",
    endTime: "16:00",
    category: "trading",
    title: "Trading session — US market open",
    note: "Execute your plan. Strict rules, no revenge trading.",
  },
  {
    startTime: "16:00",
    endTime: "16:30",
    category: "trading",
    title: "Trade journal + debrief",
    note: "Log every trade. What worked, what didn't. Non-negotiable.",
  },
  {
    startTime: "16:30",
    endTime: "19:00",
    category: "learning",
    title: "Overflow / extra learning block",
    note: "Catch-up on clipping, deep-dive study, or side research.",
  },
  {
    startTime: "19:00",
    endTime: "20:00",
    category: "break",
    title: "Dinner + downtime",
    note: "Actual leisure. No guilt.",
  },
  {
    startTime: "20:00",
    endTime: "22:00",
    category: "wind-down",
    title: "Free time / light content consumption",
    note: "Watch something, relax. Intentional, not mindless scrolling.",
  },
  {
    startTime: "22:00",
    endTime: "23:00",
    category: "wind-down",
    title: "Wind-down routine",
    note: "No screens after 22:30. Read, journal, prep for tomorrow.",
  },
];

// Mittwoch: wie STD, aber 3 Notes weichen ab.
const WED_DAY: Block[] = STD_DAY.map((b) => {
  if (b.startTime === "11:00")
    return {
      ...b,
      note: "Wednesday deep dive — pick ONE skill to go deep on this week.",
    };
  if (b.startTime === "13:30")
    return { ...b, note: "Midweek reset. Push harder today." };
  if (b.startTime === "16:30")
    return {
      ...b,
      note: "Midweek: review your analytics. What's performing? Double down.",
    };
  return b;
});

const FRI_DAY: Block[] = [
  {
    startTime: "07:00",
    endTime: "07:30",
    category: "morning",
    title: "Wake up + morning routine",
    note: "No phone. Water, quick prep, get your head right.",
  },
  {
    startTime: "07:30",
    endTime: "09:30",
    category: "clipping",
    title: "Clipping session 1 — deep work",
    note: "Find, cut and edit all 3 videos for the day. No interruptions.",
  },
  {
    startTime: "09:30",
    endTime: "10:00",
    category: "break",
    title: "Break + meal 1",
    note: "Eat, step outside, reset. No scrolling.",
  },
  {
    startTime: "10:00",
    endTime: "11:00",
    category: "clipping",
    title: "Clipping session 2 — finish + schedule",
    note: "Final edits, captions, thumbnails. Schedule all 3 posts.",
  },
  {
    startTime: "11:00",
    endTime: "13:00",
    category: "learning",
    title: "Learning block — video/content growth",
    note: "Friday: experiment block. Try a new editing style or format.",
  },
  {
    startTime: "13:00",
    endTime: "13:30",
    category: "break",
    title: "Lunch + real break",
    note: "Step away from the screen completely.",
  },
  {
    startTime: "13:30",
    endTime: "15:00",
    category: "calisthenics",
    title: "Calisthenics (40 min) + shower",
    note: "40 min workout, then clean up. Done by 15:00.",
  },
  {
    startTime: "15:00",
    endTime: "15:30",
    category: "trading",
    title: "Pre-market prep",
    note: "Friday markets can be volatile. Plan conservatively.",
  },
  {
    startTime: "15:30",
    endTime: "16:00",
    category: "trading",
    title: "Trading session — US market open",
    note: "Execute your plan. Strict rules, no revenge trading.",
  },
  {
    startTime: "16:00",
    endTime: "16:30",
    category: "trading",
    title: "Trade journal + debrief",
    note: "End of week: note any patterns in your trading this week.",
  },
  {
    startTime: "16:30",
    endTime: "19:00",
    category: "wind-down",
    title: "Free time — earned",
    note: "You put in the work. Relax without guilt.",
  },
  {
    startTime: "19:00",
    endTime: "23:00",
    category: "wind-down",
    title: "Evening — fully off",
    note: "Social, food, whatever. Recharge for the weekend.",
  },
];

const SAT_DAY: Block[] = [
  {
    startTime: "07:00",
    endTime: "08:00",
    category: "morning",
    title: "Slower wake up",
    note: "No alarm if possible. Still no phone first thing.",
  },
  {
    startTime: "08:00",
    endTime: "10:00",
    category: "clipping",
    title: "Clipping session — weekend batch",
    note: "Get ahead. Aim to pre-produce Monday's videos today.",
  },
  {
    startTime: "10:00",
    endTime: "10:30",
    category: "break",
    title: "Break + meal 1",
    note: "Eat well. You've got a full workout coming.",
  },
  {
    startTime: "10:30",
    endTime: "11:30",
    category: "calisthenics",
    title: "Calisthenics (40 min) + shower",
    note: "Saturday workout — go at your own pace, no rush.",
  },
  {
    startTime: "11:30",
    endTime: "13:30",
    category: "learning",
    title: "Content analytics review + strategy",
    note: "What's your best-performing content this week? Why? Build on it.",
  },
  {
    startTime: "13:30",
    endTime: "19:00",
    category: "wind-down",
    title: "Afternoon off",
    note: "Go outside. Social stuff. No trading, no clipping. Full reset.",
  },
  {
    startTime: "19:00",
    endTime: "23:00",
    category: "wind-down",
    title: "Evening free",
    note: "Do whatever. You've earned it.",
  },
];

const SUN_DAY: Block[] = [
  {
    startTime: "07:00",
    endTime: "09:00",
    category: "morning",
    title: "Slow morning — no work",
    note: "Eat, walk, breathe. Full rest mode until 09:00.",
  },
  {
    startTime: "09:00",
    endTime: "09:40",
    category: "calisthenics",
    title: "Calisthenics (40 min)",
    note: "Light-to-moderate session. Maintain the habit, don't grind.",
  },
  {
    startTime: "09:40",
    endTime: "10:00",
    category: "break",
    title: "Shower + reset",
    note: "Clean up, eat, get into review mode.",
  },
  {
    startTime: "10:00",
    endTime: "11:30",
    category: "review",
    title: "Weekly review",
    note: "Did you post all 21 videos? Trade stats review. What slipped? Be honest.",
  },
  {
    startTime: "11:30",
    endTime: "13:00",
    category: "review",
    title: "Weekly planning session",
    note: "Set next week's focus. Content themes, trading goals, learning target.",
  },
  {
    startTime: "13:00",
    endTime: "23:00",
    category: "wind-down",
    title: "Full rest — no screen guilt",
    note: "Social, walks, food, entertainment. Sunday is your fuel for the week.",
  },
];

function withDay(day: number, blocks: Block[]): DefaultBlock[] {
  return blocks.map((b) => ({ ...b, day }));
}

export const DEFAULT_WEEK: DefaultBlock[] = [
  ...withDay(0, STD_DAY), // Mo
  ...withDay(1, STD_DAY), // Di
  ...withDay(2, WED_DAY), // Mi
  ...withDay(3, STD_DAY), // Do
  ...withDay(4, FRI_DAY), // Fr
  ...withDay(5, SAT_DAY), // Sa
  ...withDay(6, SUN_DAY), // So
];
