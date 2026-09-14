import type { UsageMetric as UsageMetricType } from "../types/usage";

type Props = {
  metric: UsageMetricType;
};

function UsageMetric({ metric }: Props) {
  return (
    <section
      className="usage-section"
      data-tauri-drag-region
    >
      <div
        className="usage-title-row"
        data-tauri-drag-region
      >
        <span data-tauri-drag-region>
          {metric.label}
        </span>

        <span
          className="usage-value"
          data-tauri-drag-region
        >
          {metric.displayValue}
        </span>
      </div>

      <div
        className="progress-track"
        data-tauri-drag-region
      >
        <div
          className="progress-fill"
          style={{
            width: `${Math.min(metric.value, 100)}%`,
          }}
        />
      </div>

      {metric.subtitle && (
        <p
          className="usage-subtitle"
          data-tauri-drag-region
        >
          {metric.subtitle}
        </p>
      )}
    </section>
  );
}

export default UsageMetric;