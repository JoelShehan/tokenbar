import type { UsageStat as UsageStatType } from "../types/usage";

type Props = {
  stat: UsageStatType;
};

function UsageStat({ stat }: Props) {
  return (
    <div
      className="stat"
      data-tauri-drag-region
    >
      <span
        className="stat-label"
        data-tauri-drag-region
      >
        {stat.label}
      </span>

      <strong data-tauri-drag-region>
        {stat.value}
      </strong>
    </div>
  );
}

export default UsageStat;