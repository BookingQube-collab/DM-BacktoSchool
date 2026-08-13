import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  ADMIN_CHART_COLORS,
  chartColor,
  shortDateLabel,
  truncateLabel,
  type DayBucket,
  type NamedCount,
  type StoreValueBucket,
} from "@/lib/admin-charts";
import { formatQar } from "@/lib/registration";
import { cn } from "@/lib/utils";

type PanelProps = {
  title: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
  empty?: boolean;
  emptyMessage?: string;
};

export function AdminChartPanel({
  title,
  subtitle,
  className,
  children,
  empty,
  emptyMessage = "No data for this filter.",
}: PanelProps) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-secondary/40 p-4",
        className,
      )}
    >
      <div className="mb-3">
        <h3 className="font-display text-base font-bold">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {empty ? (
        <p className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        children
      )}
    </div>
  );
}

const barConfig = {
  value: { label: "Value", color: ADMIN_CHART_COLORS[0] },
  count: { label: "Count", color: ADMIN_CHART_COLORS[1] },
} satisfies ChartConfig;

const lineConfig = {
  count: { label: "Registrations", color: ADMIN_CHART_COLORS[0] },
  transaction_value: { label: "Value", color: ADMIN_CHART_COLORS[1] },
} satisfies ChartConfig;

export function StoreValueBarChart({
  stores,
  heightClass = "aspect-auto h-[220px] w-full",
}: {
  stores: StoreValueBucket[];
  heightClass?: string;
}) {
  const data = stores.slice(0, 10).map((s) => ({
    name: truncateLabel(s.store_name, 16),
    fullName: s.store_name,
    value: Math.round(s.transaction_value * 100) / 100,
    receipts: s.receipts,
  }));

  return (
    <AdminChartPanel
      title="Top stores by value"
      subtitle="Transaction value (QAR) in the selected range"
      empty={data.length === 0}
    >
      <ChartContainer config={barConfig} className={heightClass}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={0}
            angle={data.length > 5 ? -25 : 0}
            textAnchor={data.length > 5 ? "end" : "middle"}
            height={data.length > 5 ? 56 : 28}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v) =>
              v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v)
            }
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, _name, item) => {
                  const row = item?.payload as
                    | { fullName?: string; receipts?: number }
                    | undefined;
                  return (
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">
                        {row?.fullName ?? "Store"}
                      </span>
                      <span>{formatQar(Number(value))}</span>
                      {typeof row?.receipts === "number" ? (
                        <span className="text-muted-foreground">
                          {row.receipts} receipt
                          {row.receipts === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                  );
                }}
                hideLabel
              />
            }
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="var(--color-value)" />
        </BarChart>
      </ChartContainer>
    </AdminChartPanel>
  );
}

export function RegistrationsOverTimeChart({
  days,
  heightClass = "aspect-auto h-[220px] w-full",
}: {
  days: DayBucket[];
  heightClass?: string;
}) {
  const data = days.map((d) => ({
    ...d,
    label: shortDateLabel(d.date),
  }));
  const hasAny = data.some((d) => d.count > 0);

  return (
    <AdminChartPanel
      title="Registrations over time"
      subtitle="Daily guest registrations"
      empty={!hasAny}
    >
      <ChartContainer config={lineConfig} className={heightClass}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={36}
            allowDecimals={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--color-count)"
            fill="var(--color-count)"
            fillOpacity={0.25}
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </AdminChartPanel>
  );
}

export function NamedCountBarChart({
  title,
  subtitle,
  items,
  heightClass = "aspect-auto h-[200px] w-full",
  valueKey = "count",
}: {
  title: string;
  subtitle?: string;
  items: NamedCount[];
  heightClass?: string;
  valueKey?: "count";
}) {
  const data = items.slice(0, 8).map((item) => ({
    name: truncateLabel(item.name, 14),
    fullName: item.name,
    count: item.count,
  }));

  return (
    <AdminChartPanel
      title={title}
      subtitle={subtitle}
      empty={data.length === 0}
    >
      <ChartContainer config={barConfig} className={heightClass}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={88}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, _name, item) => {
                  const row = item?.payload as { fullName?: string } | undefined;
                  return (
                    <span>
                      {row?.fullName}: {Number(value)}
                    </span>
                  );
                }}
                hideLabel
              />
            }
          />
          <Bar
            dataKey={valueKey}
            radius={[0, 6, 6, 0]}
            fill="var(--color-count)"
          />
        </BarChart>
      </ChartContainer>
    </AdminChartPanel>
  );
}

export function NamedCountDonutChart({
  title,
  subtitle,
  items,
  heightClass = "aspect-auto h-[200px] w-full",
}: {
  title: string;
  subtitle?: string;
  items: NamedCount[];
  heightClass?: string;
}) {
  const data = items.slice(0, 8).map((item, i) => ({
    name: item.name,
    count: item.count,
    fill: chartColor(i),
  }));
  const config = Object.fromEntries(
    data.map((d) => [d.name, { label: d.name, color: d.fill }]),
  ) satisfies ChartConfig;

  return (
    <AdminChartPanel
      title={title}
      subtitle={subtitle}
      empty={data.length === 0}
    >
      <ChartContainer config={config} className={heightClass}>
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <span>
                    {String(name)}: {Number(value)}
                  </span>
                )}
                hideLabel
              />
            }
          />
          <Pie
            data={data}
            dataKey="count"
            nameKey="name"
            innerRadius={48}
            outerRadius={72}
            strokeWidth={2}
            stroke="oklch(0.22 0.09 285)"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      {data.length > 0 ? (
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-1.5">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: d.fill }}
              />
              <span className="truncate max-w-[9rem]">
                {d.name} ({d.count})
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </AdminChartPanel>
  );
}

export function PhotosByDayChart({
  days,
  heightClass = "aspect-auto h-[200px] w-full",
}: {
  days: DayBucket[];
  heightClass?: string;
}) {
  const data = days.map((d) => ({
    ...d,
    label: shortDateLabel(d.date),
  }));
  const hasAny = data.some((d) => d.count > 0);

  return (
    <AdminChartPanel
      title="Photos by day"
      subtitle="Booth sessions in the selected range"
      empty={!hasAny}
    >
      <ChartContainer config={barConfig} className={heightClass}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={20}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={32}
            allowDecimals={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="var(--color-count)" />
        </BarChart>
      </ChartContainer>
    </AdminChartPanel>
  );
}

export function LogoCoverageBar({
  withLogo,
  withoutLogo,
}: {
  withLogo: number;
  withoutLogo: number;
}) {
  const total = withLogo + withoutLogo;
  const pct = total > 0 ? Math.round((withLogo / total) * 100) : 0;

  return (
    <AdminChartPanel
      title="Logo coverage"
      subtitle={`${withLogo} of ${total} stores have logos`}
      empty={total === 0}
      emptyMessage="No stores configured yet."
    >
      <div className="space-y-3 pt-2">
        <div className="flex items-end justify-between gap-2">
          <p className="font-display text-3xl font-bold">{pct}%</p>
          <p className="text-sm text-muted-foreground">
            {withoutLogo} missing
          </p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${ADMIN_CHART_COLORS[0]}, ${ADMIN_CHART_COLORS[1]})`,
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-border bg-background/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">With logo</p>
            <p className="font-display text-xl font-bold">{withLogo}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">No logo</p>
            <p className="font-display text-xl font-bold">{withoutLogo}</p>
          </div>
        </div>
      </div>
    </AdminChartPanel>
  );
}
