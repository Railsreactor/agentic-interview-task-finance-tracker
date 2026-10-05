import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { m } from "#/paraglide/messages";
import { Select, SelectItem } from "#/components/ui/select";
import { formatMinor } from "#/lib/money";
import {
  getDashboardSummary,
  getSpendingSankey,
} from "#/server/analytics.functions";
import { getAccounts } from "#/server/accounts.functions";
import { Sankey, Tooltip, ResponsiveContainer, useChartWidth, Layer, Rectangle } from "recharts";
import { format } from "date-fns";


export const Route = createFileRoute("/_authed/dashboard")({
  component: Dashboard,
});

// --- Period presets ---

type PeriodPreset = "current_month" | "last_3_months" | "last_6_months" | "last_year";

function getPeriodDates(preset: PeriodPreset): { from: string; to: string } {
  const now = new Date();
  const to = format(now, "yyyy-MM-dd");

  let from: string;
  switch (preset) {
    case "current_month":
      from = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
      break;
    case "last_3_months":
      from = format(new Date(now.getFullYear(), now.getMonth() - 2, 1), "yyyy-MM-dd");
      break;
    case "last_6_months":
      from = format(new Date(now.getFullYear(), now.getMonth() - 5, 1), "yyyy-MM-dd");
      break;
    case "last_year":
      from = format(new Date(now.getFullYear() - 1, now.getMonth(), 1), "yyyy-MM-dd");
      break;
  }

  return { from, to };
}

// --- Summary Card Component ---

function SummaryCard({
  title,
  value,
  accent,
}: {
  title: string;
  value: string;
  accent: "income" | "expense" | "net";
}) {
  const colorMap = {
    income: "text-emerald-600 dark:text-emerald-400",
    expense: "text-red-600 dark:text-red-400",
    net: "text-blue-600 dark:text-blue-400",
  };

  const bgMap = {
    income: "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20",
    expense: "border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20",
    net: "border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/20",
  };

  return (
    <div
      className={`rounded-xl border p-4 ${bgMap[accent]} transition-colors`}
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {title}
      </p>
      <p className={`text-2xl font-bold tabular-nums ${colorMap[accent]}`}>
        {value}
      </p>
    </div>
  );
}

// --- Period Selector ---

function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodPreset;
  onChange: (preset: PeriodPreset) => void;
}) {
  const presets: { key: PeriodPreset; label: string }[] = [
    { key: "current_month", label: m.analytics_current_month() },
    { key: "last_3_months", label: m.analytics_last_3_months() },
    { key: "last_6_months", label: m.analytics_last_6_months() },
    { key: "last_year", label: m.analytics_last_year() },
  ];

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-muted-foreground">
        {m.analytics_period()}:
      </label>
      <div className="flex gap-1">
        {presets.map((preset) => (
          <button
            key={preset.key}
            onClick={() => onChange(preset.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              value === preset.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Account Filter ---

function AccountFilter({
  accounts,
  value,
  onChange,
}: {
  accounts: Array<{ id: string; name: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-muted-foreground">
        {m.account_filter()}:
      </label>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-auto px-2 text-xs"
      >
        <SelectItem value="">{m.analytics_all_accounts()}</SelectItem>
        {accounts.map((acc) => (
          <SelectItem key={acc.id} value={acc.id}>
            {acc.name}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
}

// --- Sankey Chart Component ---

function SpendingSankeyChart({
  nodes,
  links,
}: {
  nodes: Array<{ name: string; color?: string }>;
  links: Array<{ source: number; target: number; value: number }>;
}) {
  if (nodes.length === 0 || links.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-80 text-center">
        <p className="text-sm text-muted-foreground">{m.analytics_no_data()}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {m.analytics_no_data_desc()}
        </p>
      </div>
    );
  }

  const sankeyData = { nodes, links };

  return (
    <ResponsiveContainer width="100%" height={500}>
      <Sankey
        data={sankeyData}
        dataKey="value"
        nameKey="name"
        nodeWidth={12}
        nodePadding={12}
        align="justify"
        node={({ x, y, width, height, index, payload }) => {
          const containerWidth = useChartWidth();
          const nodeName = (payload as { name?: string }).name;
          const nodeColor = (payload as { color?: string }).color;
          const depth = (payload as { depth?: number }).depth;
          if (containerWidth == null) return null;
          // Leftmost column (depth 0): label on the left; others: label on the right
          const isLeftColumn = depth === 0;
          const textX = isLeftColumn ? x - 6 : x + width + 6;
          const textAnchor = isLeftColumn ? "end" : "start";
          return (
            <Layer key={`CustomNode${index}`}>
              <Rectangle
                x={x}
                y={y}
                width={width}
                height={height}
                fill={nodeColor || "#6366f1"}
                stroke="none"
                cursor="pointer"
              />
              {nodeName && (
                <text
                  textAnchor={textAnchor}
                  x={textX}
                  y={y + height / 2}
                  fill="#0f172a"
                  fontSize={11}
                  fontWeight={500}
                >
                  {nodeName}
                </text>
              )}
            </Layer>
          );
        }}
        link={{
          fillOpacity: 0.35,
          cursor: "pointer",
        }}
        margin={{ top: 20, right: 120, bottom: 20, left: 50 }}
      >
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const data = payload[0]?.payload;
              if (data?.source !== undefined && typeof data.source === "number") {
                const sourceNode = nodes[data.source];
                const targetNode = nodes[data.target];
                return (
                  <div className="island-shell rounded-lg p-3 shadow-lg border border-line/50">
                    <p className="text-xs font-medium mb-1">
                      {sourceNode?.name} → {targetNode?.name}
                    </p>
                    <p className="text-sm font-bold tabular-nums">
                      {formatMinor(data.value)} {m.analytics_currency()}
                    </p>
                  </div>
                );
              }
              const nodeData = data as { name?: string; color?: string } | undefined;
              const nodeLinks = links.filter(
                (l) => l.source === data?.index || l.target === data?.index,
              );
              const totalValue = nodeLinks.reduce((sum, l) => sum + l.value, 0);
              return (
                <div className="island-shell rounded-lg p-3 shadow-lg border border-line/50">
                  <p className="text-sm font-bold">{nodeData?.name}</p>
                  {totalValue > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                      {formatMinor(totalValue)} {m.analytics_currency()}
                    </p>
                  )}
                </div>
              );
            }
            return null;
          }}
        />
      </Sankey>
    </ResponsiveContainer>
  );
}

// --- Top Categories List ---

function TopCategoriesList({
  categories,
}: {
  categories: Array<{
    categoryId: string;
    categoryName: string;
    categoryColor: string | null;
    totalSpent: number;
  }>;
}) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="island-shell rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3">{m.analytics_top_categories()}</h3>
      <div className="space-y-2">
        {categories.map((cat, idx) => (
          <div key={cat.categoryId} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-4 text-right tabular-nums">
              {idx + 1}
            </span>
            <span
              className="size-3 rounded-full shrink-0"
              style={{ backgroundColor: cat.categoryColor ?? "#6b7280" }}
            />
            <span className="flex-1 text-sm truncate">{cat.categoryName}</span>
            <span className="text-sm font-medium tabular-nums">
              {formatMinor(cat.totalSpent)} {m.analytics_currency()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Main Dashboard ---

function Dashboard() {
  const [period, setPeriod] = useState<PeriodPreset>("current_month");
  const [accountId, setAccountId] = useState<string>("");

  const periodDates = useMemo(() => getPeriodDates(period), [period]);

  const filterParams = useMemo(
    () => ({
      from: periodDates.from,
      to: periodDates.to,
      accountId: accountId || undefined,
    }),
    [periodDates, accountId],
  );

  const getSummaryFn = useServerFn(getDashboardSummary);
  const getSankeyFn = useServerFn(getSpendingSankey);
  const getAccountsFn = useServerFn(getAccounts);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["dashboard-summary", filterParams],
    queryFn: () => getSummaryFn({ data: filterParams }),
  });

  const { data: sankeyData, isLoading: sankeyLoading } = useQuery({
    queryKey: ["dashboard-sankey", filterParams],
    queryFn: () => getSankeyFn({ data: filterParams }),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => getAccountsFn(),
  });

  const isLoading = summaryLoading || sankeyLoading;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-line/50 bg-header-bg/80 backdrop-blur-sm">
        <div className="page-wrap py-4">
          <h1 className="text-xl font-bold display-title mb-3">
            {m.dashboard_heading()}
          </h1>
          <div className="flex flex-wrap items-center gap-4">
            <PeriodSelector value={period} onChange={setPeriod} />
            <AccountFilter
              accounts={accounts}
              value={accountId}
              onChange={setAccountId}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="page-wrap py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">
                {m.loading()}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SummaryCard
                title={m.analytics_total_income()}
                value={`${formatMinor(summary?.totalIncome ?? 0)} ${m.analytics_currency()}`}
                accent="income"
              />
              <SummaryCard
                title={m.analytics_total_expenses()}
                value={`${formatMinor(summary?.totalExpenses ?? 0)} ${m.analytics_currency()}`}
                accent="expense"
              />
              <SummaryCard
                title={m.analytics_net()}
                value={`${formatMinor(summary?.net ?? 0)} ${m.analytics_currency()}`}
                accent="net"
              />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Sankey Chart */}
              <div className="lg:col-span-2 island-shell rounded-xl p-4">
                <h2 className="text-sm font-semibold mb-1">
                  {m.analytics_spending_sankey()}
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  {m.analytics_spending_sankey_desc()}
                </p>
                <SpendingSankeyChart
                  nodes={sankeyData?.nodes ?? []}
                  links={sankeyData?.links ?? []}
                />
              </div>

              {/* Top Categories */}
              <div>
                <TopCategoriesList categories={summary?.topCategories ?? []} />
              </div>
            </div>

            {/* Outlet for nested routes */}
            <Outlet />
          </div>
        )}
      </main>
    </div>
  );
}
