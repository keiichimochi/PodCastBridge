export type MaxDurationOption = "5" | "10" | "unlimited";

interface DurationOptionConfig {
  value: MaxDurationOption;
  label: string;
  seconds?: number;
}

const OPTION_CONFIGS: DurationOptionConfig[] = [
  { value: "5", label: "5分以内", seconds: 5 * 60 },
  { value: "10", label: "10分以内", seconds: 10 * 60 },
  { value: "unlimited", label: "無制限" }
];

const OPTION_LOOKUP: Record<MaxDurationOption, DurationOptionConfig> = OPTION_CONFIGS.reduce(
  (acc, option) => {
    acc[option.value] = option;
    return acc;
  },
  {} as Record<MaxDurationOption, DurationOptionConfig>
);

export const MAX_DURATION_SELECT_OPTIONS = OPTION_CONFIGS;

export function normalizeMaxDuration(value: unknown): MaxDurationOption {
  if (value === "5" || value === "10" || value === "unlimited") {
    return value;
  }
  return "unlimited";
}

export function maxDurationOptionToSeconds(option: MaxDurationOption): number | undefined {
  return OPTION_LOOKUP[option].seconds;
}
