import { DollarSign } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type RevenueDisplayProps = {
  totalRevenue: number;
  breakdown: {
    esg: number;
    gdt: number;
    gvc: number;
    msg_us: number;
  };
};

export function RevenueDisplay({ totalRevenue, breakdown }: RevenueDisplayProps) {
  const formatRevenue = (revenue: number) => {
    if (revenue >= 1_000_000) {
      return `$${(revenue / 1_000_000).toFixed(1)}M`;
    }
    if (revenue >= 1_000) {
      return `$${(revenue / 1_000).toFixed(0)}K`;
    }
    return `$${revenue.toFixed(0)}`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200 hover:bg-green-100 transition-colors cursor-pointer">
            <DollarSign className="h-4 w-4 text-green-600" />
            <span className="text-sm font-bold text-green-800">{formatRevenue(totalRevenue)}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 text-white border-slate-700">
          <div className="space-y-2 text-sm">
            <div className="font-bold text-green-400">Revenue Breakdown:</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex justify-between">
                <span className="text-slate-300">ESG:</span>
                <span className="font-medium">{formatRevenue(breakdown.esg)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">GDT:</span>
                <span className="font-medium">{formatRevenue(breakdown.gdt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">GVC:</span>
                <span className="font-medium">{formatRevenue(breakdown.gvc)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">MSG US:</span>
                <span className="font-medium">{formatRevenue(breakdown.msg_us)}</span>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
