export const colorNames = ["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
export type ColorName = typeof colorNames[number];
export function isEmoji(value: string): boolean {
  return value.length <= 32 && [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length === 1
    && /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(value);
}
export interface ProjectAppearance { emoji: string | null; color: ColorName }
export const defaultAppearance: ProjectAppearance = { emoji: "📁", color: "default" };
