"use client";

import * as React from "react";
import type { TooltipContentProps } from "recharts";
import { Tooltip } from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label?: string;
    color?: string;
  }
>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig;
  className?: string;
  children: React.ReactNode;
}) {
  const style = React.useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [key, v] of Object.entries(config)) {
      if (v.color) vars[`--chart-${key}`] = v.color;
    }
    return vars as React.CSSProperties;
  }, [config]);

  return (
    <ChartContext.Provider value={{ config }}>
      <div className={cn("w-full", className)} style={style}>
        {children}
      </div>
    </ChartContext.Provider>
  );
}

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) {
    throw new Error("Chart components must be wrapped in <ChartContainer />.");
  }
  return ctx;
}

export function ChartTooltipContent(
  props: Partial<TooltipContentProps<number, string>> & {
    className?: string;
    labelFormatter?: (label: unknown) => React.ReactNode;
  }
) {
  const { className, labelFormatter } = props;
  const { config } = useChart();
  const payload = props.payload ?? [];

  if (!props.active || payload.length === 0) return null;

  const label = labelFormatter ? labelFormatter(props.label) : props.label;

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-xl",
        className
      )}
    >
      {label != null && <div className="mb-2 text-xs font-semibold text-zinc-700">{label}</div>}
      <div className="space-y-1">
        {payload.map((item) => {
          const key = item.dataKey ?? item.name ?? "value";
          const conf = config[String(key)];
          const color =
            conf?.color ||
            (typeof item.color === "string" ? item.color : "hsl(var(--chart-value))");

          return (
            <div key={String(key)} className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="text-zinc-600">{conf?.label ?? item.name ?? String(key)}</span>
              </div>
              <span className="font-semibold text-zinc-900">
                {typeof item.value === "number" ? item.value.toFixed(0) : String(item.value ?? "")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartTooltip({
  content,
  cursor = false,
  ...props
}: React.ComponentProps<typeof Tooltip> & { content?: React.ReactNode }) {
  return <Tooltip cursor={cursor} content={content} {...props} />;
}



