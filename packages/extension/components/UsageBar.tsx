import type { UsageInfo } from "@/hooks/useUsage";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export const UsageBar = ({ usage }: { usage: UsageInfo }) => {
  if (usage.totalTokens === 0) return null;

  return (
    <div className="text-default-400 flex shrink-0 items-center justify-between px-3 py-0.5 text-[10px]">
      <span>
        {formatTokens(usage.inputTokens)} in / {formatTokens(usage.outputTokens)} out
      </span>
      {usage.percent > 0 && <span>{usage.percent.toFixed(0)}% context</span>}
    </div>
  );
};
