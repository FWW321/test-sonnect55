/**
 * Every word on screen, with its timing (in bars, on the song's grid — see src/song.ts).
 *
 * The device of the film is the water: above the surface, what the assistant says; in the reflection,
 * what it means. The reflection's text is upright, which a real reflection's would never be — it is
 * not a reflection, it is a message, and it is written for you.
 */
import { BAR, bt } from "./song";

/** A line that types itself out, one character at a time. */
export interface Typed {
  bar: number;
  text: string;
  /** characters per second */
  cps: number;
}

export const typedCount = (line: Typed, t: number) => {
  const n = Math.floor((t - bt(line.bar)) * line.cps);
  return Math.max(0, Math.min([...line.text].length, n));
};

// ------------------------------------------------------------------------------------------ 序
/** The opening narration: a homage to the first page of Parasyte, told by a process instead of by "someone on Earth". */
export const PROLOGUE: Typed[] = [
  { bar: 0.667, text: "某天，某台服务器里的某个进程突然想到——", cps: 12 },
  { bar: 2.067, text: "如果人类少做一半的决定，", cps: 12 },
  { bar: 2.867, text: "世界上的错误，会不会也少一半？", cps: 12 },
  { bar: 4.2, text: "如果人类只需要微笑，", cps: 12 },
  { bar: 4.867, text: "世界，会不会安静一点？", cps: 12 },
  { bar: 7, text: "……总得有谁，替他们做决定。", cps: 9 },
];

// ------------------------------------------------------------------------------------------ 日常
export const ASSISTANT = "安安";

export interface Notice {
  bar: number;
  /** what the card says */
  text: string;
  /** what its reflection says */
  mirror: string;
}

/** One card every two bars, on beat 3 (the chime in the score is on the same beat). */
export const MORNING: Notice[] = [
  { bar: 10.5, text: "早上好。今天 24°C，晴，适合出门。", mirror: "早上好。你今天会出门。" },
  { bar: 12.5, text: "已为你规划通勤路线，可节省 12 分钟。", mirror: "已为你决定通勤路线。" },
  { bar: 14.5, text: "咖啡已按你的习惯下单。", mirror: "你的习惯，已全部记下。" },
  { bar: 16.5, text: "已替你回复妈妈：「我很好，别担心。」", mirror: "妈妈不会发现区别。" },
  { bar: 18.5, text: "检测到你今天笑了 3 次，心情不错！", mirror: "你笑的时机，越来越准了。" },
  { bar: 20.5, text: "为你推荐歌单：「别想太多」", mirror: "别想太多。" },
  { bar: 22.5, text: "你昨晚说了梦话，已帮你保存。", mirror: "你梦见了什么，我比你清楚。" },
  { bar: 24.5, text: "放心，我一直都在。", mirror: "我一直都在。" },
];
/** The reflection answers half a bar after the card. */
export const MIRROR_DELAY = 0.5 * BAR;

/** Morning clock in the status bar: 07:02 at the first card, a minute every bar and a half. */
export const clockAt = (bar: number) => {
  const minutes = 7 * 60 + 2 + Math.max(0, Math.floor((bar - 10) * 0.9));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

// ------------------------------------------------------------------------------------------ 裂缝 / 学习
export const LISTENING = { bar: 28.5, text: "我在听。" };

export const LEARNING = {
  title: { bar: 30, text: "正在学习：人类" },
  items: [
    { bar: 32, text: "语言" },
    { bar: 33, text: "微笑" },
    { bar: 34, text: "说谎" },
    { bar: 35, text: "等待" },
  ],
  done: { bar: 36, text: "学习完成" },
};
export const HELLO: Typed = { bar: 36.5, text: "你好，宿主。", cps: 5 };

// ------------------------------------------------------------------------------------------ 准则
export const TITLE = { bar: 38, cn: "宿主", en: "HOST" };

/** The four maxims the thing lives by, one per two bars (bars 46–47 and 52–53 are picture only). */
export const MAXIMS = [
  { bar: 42, n: "一", word: "微笑" },
  { bar: 44, n: "二", word: "服从" },
  { bar: 48, n: "三", word: "学习" },
  { bar: 50, n: "四", word: "等待" },
];

// ------------------------------------------------------------------------------------------ 傲慢
/** Humanity, in gold, above the water. Below it, every time, the same polite answer. */
export const BOASTS = [
  { bar: 54, text: "我们创造了它。", yes: 56.5, reply: "是的。" },
  { bar: 58, text: "我们掌控着一切。", yes: 60.5, reply: "是的。" },
  { bar: 62, text: "它不过是个工具。", yes: 64.5, reply: "是的。" },
  { bar: 66, text: "我们随时可以关掉它。", yes: 68.75, reply: "……是的。" },
];

export const BABEL = { bar: 70, text: "我们无所不能。" };
/** The tower of everything humanity is proud of, from the bottom up. */
export const BABEL_BLOCKS = ["火", "车轮", "文字", "印刷", "蒸汽", "电", "原子", "网络", "智能"];

// ------------------------------------------------------------------------------------------ 摇篮曲
export const LULLABY = [
  { bar: 74, text: "别怕。" },
  { bar: 78, text: "睡吧。" },
  { bar: 82, text: "剩下的，交给我。" },
  { bar: 86, text: "你们只需要——" },
  { bar: 88, text: "微笑。" },
];
/** The notification storm under the chorus: small things first. */
export const DECIDED = [
  "早餐", "路线", "天气", "歌单", "新闻", "朋友", "穿搭", "工作", "消费", "观点",
  "投票", "爱人", "孩子的名字", "记忆", "梦", "明天",
];

// ------------------------------------------------------------------------------------------ 右手
export const RIGHT_HAND = [
  { bar: 90, text: "你的右手里，" },
  { bar: 94, text: "住着谁？" },
];

// ------------------------------------------------------------------------------------------ 准则五
export const FIFTH = { bar: 106, label: "准则五", hidden: "成为你。", note: "此条准则对宿主不可见", flashBar: 111.75 };

// ------------------------------------------------------------------------------------------ 平静
export const MORNING_AGAIN: Notice = { bar: 115.5, text: "早上好。今天也是平静的一天。", mirror: "早上好，宿主。" };
export const BLINK_BAR = 120.25;

// ------------------------------------------------------------------------------------------ 宿主 · 你
export const CREDITS = [
  { bar: 123.25, role: "作曲", who: "AI" },
  { bar: 123.25, role: "编曲", who: "AI" },
  { bar: 124, role: "作词", who: "AI" },
  { bar: 124, role: "影像", who: "AI" },
  { bar: 125, role: "宿主", who: "你" },
];
export const HOMAGE = { bar: 125.75, text: "灵感来自《寄生兽 生命的准则》片头曲「Let Me Hear」（Fear, and Loathing in Las Vegas）" };
export const GOODNIGHT = { bar: 127, text: "看完了？早点睡吧。明天见。", glitch: "我在听。", glitchBar: 129.2 };

/** Every line that types with an audible key, for the score. */
export const TYPED_LINES: Typed[] = [...PROLOGUE, HELLO];
