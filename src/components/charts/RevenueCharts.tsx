'use client'

import { memo, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Building2, Map } from "lucide-react";

type Account = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  industry: string | null;
  current_division: string;
  total_revenue: number;
  revenue_breakdown: {
    esg: number;
    gdt: number;
    gvc: number;
    msg_us: number;
  };
  status?: 'assigned' | 'pinned' | 'must_keep' | 'for_discussion' | 'to_be_peeled' | 'approval_for_pinning' | 'approval_for_assigning' | 'up_for_debate' | 'peeled' | 'available';
  isOriginal: boolean;
};

type RevenueChartsProps = {
  assignedAccounts: Account[];
  totalRevenue: number;
};

const formatRevenue = (amount: number) => {
  return amount >= 1_000_000 
    ? `$${(amount / 1_000_000).toFixed(1)}M`
    : amount >= 1_000 
    ? `$${(amount / 1_000).toFixed(0)}K`
    : `$${amount.toFixed(0)}`;
};

const DivisionChart = memo(({ assignedAccounts, totalRevenue }: RevenueChartsProps) => {
  const divisionData = useMemo(() => {
    const sellerDivisionRevenue = assignedAccounts.reduce((totals, account) => {
      totals.esg += account.revenue_breakdown.esg;
      totals.gdt += account.revenue_breakdown.gdt;
      totals.gvc += account.revenue_breakdown.gvc;
      totals.msg_us += account.revenue_breakdown.msg_us;
      return totals;
    }, { esg: 0, gdt: 0, gvc: 0, msg_us: 0 });

    return [
      { name: 'ESG', value: sellerDivisionRevenue.esg, color: '#10b981' },
      { name: 'GDT', value: sellerDivisionRevenue.gdt, color: '#3b82f6' },
      { name: 'GVC', value: sellerDivisionRevenue.gvc, color: '#8b5cf6' },
      { name: 'MSG US', value: sellerDivisionRevenue.msg_us, color: '#f59e0b' }
    ].filter(item => item.value > 0);
  }, [assignedAccounts]);

  if (divisionData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <Building2 className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-lg font-medium">No revenue data available</p>
        <p className="text-sm">Assign accounts to see division revenue distribution</p>
      </div>
    );
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={divisionData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={120}
            paddingAngle={5}
            dataKey="value"
          >
            {divisionData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number) => {
              const percentage = totalRevenue > 0 ? ((value / totalRevenue) * 100).toFixed(1) : '0.0';
              return [
                `${formatRevenue(value)} (${percentage}%)`, 
                'Revenue'
              ];
            }}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
          />
          <Legend 
            verticalAlign="bottom" 
            height={36}
            formatter={(value) => (
              <span className="text-sm font-medium text-slate-700">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
});

const StateChart = memo(({ assignedAccounts, totalRevenue }: RevenueChartsProps) => {
  const stateData = useMemo(() => {
    const stateRevenue = assignedAccounts.reduce((totals, account) => {
      if (account.state) {
        if (!totals[account.state]) {
          totals[account.state] = 0;
        }
        totals[account.state] += account.revenue_breakdown.esg + account.revenue_breakdown.gdt + account.revenue_breakdown.gvc + account.revenue_breakdown.msg_us;
      }
      return totals;
    }, {} as Record<string, number>);

    return Object.entries(stateRevenue)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([state, revenue]) => ({
        state: state.length > 10 ? state.substring(0, 10) + '...' : state,
        fullState: state,
        revenue: revenue
      }));
  }, [assignedAccounts]);

  if (stateData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <Map className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-lg font-medium">No state revenue data available</p>
        <p className="text-sm">Assign accounts to see geographic revenue distribution</p>
      </div>
    );
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={stateData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis 
            dataKey="state" 
            tick={{ fontSize: 12 }}
            stroke="#64748b"
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            stroke="#64748b"
            tickFormatter={(value) => formatRevenue(value)}
          />
          <Tooltip 
            formatter={(value: number) => {
              const percentage = totalRevenue > 0 ? ((value / totalRevenue) * 100).toFixed(1) : '0.0';
              return [
                `${formatRevenue(value)} (${percentage}%)`, 
                'Revenue'
              ];
            }}
            labelFormatter={(label, payload) => {
              const data = payload?.[0]?.payload;
              return data?.fullState || label;
            }}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
          />
          <Bar 
            dataKey="revenue" 
            fill="#3b82f6" 
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

const IndustryChart = memo(({ assignedAccounts, totalRevenue }: RevenueChartsProps) => {
  const industryData = useMemo(() => {
    const industryRevenue = assignedAccounts.reduce((totals, account) => {
      if (account.industry) {
        if (!totals[account.industry]) {
          totals[account.industry] = 0;
        }
        totals[account.industry] += account.revenue_breakdown.esg + account.revenue_breakdown.gdt + account.revenue_breakdown.gvc + account.revenue_breakdown.msg_us;
      }
      return totals;
    }, {} as Record<string, number>);

    return Object.entries(industryRevenue)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([industry, revenue]) => ({
        industry: industry.length > 15 ? industry.substring(0, 15) + '...' : industry,
        fullIndustry: industry,
        revenue: revenue
      }));
  }, [assignedAccounts]);

  if (industryData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <Building2 className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-lg font-medium">No industry revenue data available</p>
        <p className="text-sm">Assign accounts to see industry revenue distribution</p>
      </div>
    );
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={industryData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis 
            dataKey="industry" 
            tick={{ fontSize: 12 }}
            stroke="#64748b"
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            stroke="#64748b"
            tickFormatter={(value) => formatRevenue(value)}
          />
          <Tooltip 
            formatter={(value: number) => {
              const percentage = totalRevenue > 0 ? ((value / totalRevenue) * 100).toFixed(1) : '0.0';
              return [
                `${formatRevenue(value)} (${percentage}%)`, 
                'Revenue'
              ];
            }}
            labelFormatter={(label, payload) => {
              const data = payload?.[0]?.payload;
              return data?.fullIndustry || label;
            }}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
          />
          <Bar 
            dataKey="revenue" 
            fill="#8b5cf6" 
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

DivisionChart.displayName = 'DivisionChart';
StateChart.displayName = 'StateChart';
IndustryChart.displayName = 'IndustryChart';

export { DivisionChart, StateChart, IndustryChart };

// Default export for lazy loading
export default { DivisionChart, StateChart, IndustryChart };
