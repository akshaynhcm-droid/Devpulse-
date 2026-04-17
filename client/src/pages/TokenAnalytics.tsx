import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Download, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function TokenAnalytics() {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const { data: analytics, isLoading } =
    trpc.tokenAnalytics.getAnalytics.useQuery({ days: 30 });
  const { data: modelBreakdown } =
    trpc.tokenAnalytics.getModelBreakdown.useQuery(
      { model: selectedModel || "" },
      { enabled: !!selectedModel }
    );

  const handleExport = () => {
    if (!analytics) return;

    const csv = [
      [
        "Model",
        "Prompt Tokens",
        "Completion Tokens",
        "Thinking Tokens",
        "Total Tokens",
        "Cost (USD)",
      ],
      ...analytics.byModel.map((m: any) => [
        m.model,
        m.promptTokens,
        m.completionTokens,
        m.thinkingTokens,
        m.totalTokens,
        m.costUSD.toFixed(2),
      ]),
    ]
      .map(row => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "token-analytics.csv";
    a.click();
    toast.success("Analytics exported successfully!");
  };

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading analytics...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          LLM Token Analytics
        </h1>
        <p className="text-muted-foreground">
          Track token usage and costs across your AI models
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="p-6 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Total Tokens (30 days)
          </p>
          <p className="text-3xl font-bold text-foreground">
            {analytics?.totalTokens.toLocaleString() || 0}
          </p>
          <p className="text-xs text-muted-foreground">Across all models</p>
        </Card>

        <Card className="p-6 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Total Cost
          </p>
          <p className="text-3xl font-bold text-foreground">
            ${analytics?.totalCost.toFixed(2) || "0.00"}
          </p>
          <p className="text-xs text-muted-foreground">Last 30 days</p>
        </Card>

        <Card className="p-6 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Models Tracked
          </p>
          <p className="text-3xl font-bold text-foreground">
            {analytics?.byModel.length || 0}
          </p>
          <p className="text-xs text-muted-foreground">Active models</p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token Usage by Model */}
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Token Usage by Model
          </h2>
          {analytics?.byModel && analytics.byModel.length > 0 ? (
            <div className="overflow-x-auto">
              <ResponsiveContainer width="100%" height={300} minWidth={280}>
              <BarChart data={analytics.byModel}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="model" stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                  }}
                />
                <Legend />
                <Bar
                  dataKey="promptTokens"
                  stackId="a"
                  fill="#3b82f6"
                  name="Prompt"
                />
                <Bar
                  dataKey="completionTokens"
                  stackId="a"
                  fill="#10b981"
                  name="Completion"
                />
                <Bar
                  dataKey="thinkingTokens"
                  stackId="a"
                  fill="#f59e0b"
                  name="Thinking"
                />
              </BarChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No data available
            </div>
          )}
        </Card>

        {/* Cost Breakdown */}
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Cost Breakdown by Model
          </h2>
          {analytics?.byModel && analytics.byModel.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analytics.byModel}
                  dataKey="costUSD"
                  nameKey="model"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {analytics.byModel.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                  }}
                  formatter={(value: any) => `$${value.toFixed(2)}`}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No data available
            </div>
          )}
        </Card>
      </div>

      {/* Usage Trend */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          Usage Trend (30 days)
        </h2>
        {analytics?.usage && analytics.usage.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={analytics.usage}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                stroke="var(--muted-foreground)"
                tickFormatter={date => new Date(date).toLocaleDateString()}
              />
              <YAxis yAxisId="left" stroke="var(--muted-foreground)" />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="var(--muted-foreground)"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="tokens"
                stroke="#3b82f6"
                name="Tokens"
                yAxisId="left"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#ef4444"
                name="Cost ($)"
                yAxisId="right"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            No data available
          </div>
        )}
      </Card>

      {/* Model Details */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground">Models</h2>
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>

        {analytics?.byModel && analytics.byModel.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {analytics.byModel.map((model: any) => (
              <Card
                key={model.model}
                onClick={() => setSelectedModel(model.model)}
                className={`p-6 cursor-pointer transition-all ${
                  selectedModel === model.model
                    ? "border-accent bg-accent/5"
                    : "hover:shadow-md"
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">
                      {model.model}
                    </h3>
                    <span className="text-lg font-bold text-accent">
                      ${model.costUSD.toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Prompt</p>
                      <p className="text-sm font-semibold text-foreground">
                        {model.promptTokens.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Completion
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {model.completionTokens.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Thinking</p>
                      <p className="text-sm font-semibold text-foreground">
                        {model.thinkingTokens.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Total: {model.totalTokens.toLocaleString()} tokens
                    </span>
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              No token usage data available yet.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
