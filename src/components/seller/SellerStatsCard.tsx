import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, DollarSign, MapPin, Calendar, Map } from "lucide-react";

type SellerStatsCardProps = {
  accountCount: number;
  totalRevenue: number;
  location: string;
  tenure: string;
  division: string;
  statesCount: number;
};

export function SellerStatsCard({
  accountCount,
  totalRevenue,
  location,
  tenure,
  division,
  statesCount,
}: SellerStatsCardProps) {
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
    <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm w-full lg:w-auto">
      <CardContent className="p-4 lg:p-6">
        <div className="space-y-4 lg:space-y-6">
          {/* Revenue Section */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <span className="text-xl lg:text-2xl font-bold text-slate-900">{formatRevenue(totalRevenue)}</span>
            </div>
            <p className="text-sm text-slate-600">Total Revenue</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 lg:gap-4">
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <Building2 className="h-4 w-4 lg:h-5 lg:w-5 text-blue-600 mx-auto mb-2" />
              <div className="text-base lg:text-lg font-bold text-slate-900">{accountCount}</div>
              <div className="text-xs text-slate-600">Accounts</div>
            </div>
            
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <Map className="h-4 w-4 lg:h-5 lg:w-5 text-purple-600 mx-auto mb-2" />
              <div className="text-base lg:text-lg font-bold text-slate-900">{statesCount}</div>
              <div className="text-xs text-slate-600">{statesCount === 1 ? 'State' : 'States'}</div>
            </div>
          </div>

          {/* Location and Tenure */}
          <div className="space-y-2 lg:space-y-3">
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-slate-500" />
              <span className="text-sm text-slate-700 truncate">{location}</span>
            </div>
            
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-slate-500" />
              <span className="text-sm text-slate-700">{tenure} tenure</span>
            </div>
          </div>
          
          {/* Division Badge */}
          <div className="flex justify-center">
            <Badge variant="secondary" className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 border-blue-200">
              {division}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
