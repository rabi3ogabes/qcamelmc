import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  RefreshCw,
  UserPlus,
  UserCheck,
  Clock,
  MapPin,
  ExternalLink,
  Activity,
  TrendingUp,
  Eye,
  Zap,
  BarChart3,
  PieChart,
  CalendarIcon,
  FileBarChart,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, format, subDays, startOfDay, endOfDay } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

interface ActiveVisitor {
  id: string;
  session_id: string;
  ip_address: string | null;
  country: string | null;
  country_code: string | null;
  city: string | null;
  current_page: string;
  referrer: string | null;
  traffic_source: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  is_new_visitor: boolean | null;
  first_seen_at: string;
  last_seen_at: string;
  user_agent: string | null;
}

interface Stats {
  total: number;
  newVisitors: number;
  returningVisitors: number;
  desktop: number;
  mobile: number;
  tablet: number;
  countries: Record<string, { count: number; code: string }>;
  sources: Record<string, number>;
  pages: Record<string, number>;
  browsers: Record<string, number>;
  os: Record<string, number>;
  cities: Record<string, number>;
}

interface PageViewStats {
  page_path: string;
  view_count: number;
  unique_visitors: number;
}

interface VisitorsByDate {
  visit_date: string;
  total_visitors: number;
  unique_visitors: number;
  new_visitors: number;
  returning_visitors: number;
}

interface VisitorsByCountry {
  country: string;
  country_code: string;
  total_visitors: number;
  unique_visitors: number;
}

const getCountryFlag = (countryCode: string | null): string => {
  if (!countryCode || countryCode === "XX") return "🌍";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

const getDeviceIcon = (deviceType: string | null) => {
  switch (deviceType) {
    case "mobile":
      return <Smartphone className="h-4 w-4" />;
    case "tablet":
      return <Tablet className="h-4 w-4" />;
    default:
      return <Monitor className="h-4 w-4" />;
  }
};

const getSourceColor = (source: string | null): string => {
  const sourceColors: Record<string, string> = {
    direct: "bg-blue-500",
    google: "bg-red-500",
    facebook: "bg-indigo-500",
    twitter: "bg-sky-500",
    instagram: "bg-pink-500",
    whatsapp: "bg-green-500",
    telegram: "bg-cyan-500",
    youtube: "bg-red-600",
    referral: "bg-purple-500",
    internal: "bg-gray-500",
  };
  return sourceColors[source || "direct"] || "bg-muted";
};

const getSourceBadge = (source: string | null) => {
  const sourceColors: Record<string, string> = {
    direct: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    google: "bg-red-500/20 text-red-400 border-red-500/30",
    facebook: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    twitter: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    instagram: "bg-pink-500/20 text-pink-400 border-pink-500/30",
    whatsapp: "bg-green-500/20 text-green-400 border-green-500/30",
    telegram: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    youtube: "bg-red-600/20 text-red-500 border-red-600/30",
    referral: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    internal: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  const colorClass = sourceColors[source || "direct"] || "bg-muted text-muted-foreground";
  
  return (
    <Badge variant="outline" className={colorClass}>
      {source || "direct"}
    </Badge>
  );
};

const CHART_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

const StatCard = ({ 
  icon: Icon, 
  value, 
  label, 
  color,
  subValue,
}: { 
  icon: React.ElementType; 
  value: number | string; 
  label: string; 
  color: string;
  subValue?: string;
}) => (
  <Card className="p-4 sm:p-6 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
    <div className={`absolute inset-0 ${color} opacity-5 group-hover:opacity-10 transition-opacity`} />
    <div className="relative flex items-start justify-between">
      <div>
        <p className="text-3xl sm:text-4xl font-bold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground mt-1">{label}</p>
        {subValue && <p className="text-xs text-muted-foreground/70 mt-0.5">{subValue}</p>}
      </div>
      <div className={`p-3 rounded-xl ${color}/20`}>
        <Icon className={`h-6 w-6 ${color.replace('bg-', 'text-')}`} />
      </div>
    </div>
  </Card>
);

const ProgressBar = ({ label, value, total, color }: { label: string; value: number; total: number; color: string }) => {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value} <span className="text-muted-foreground text-xs">({percentage.toFixed(1)}%)</span></span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};

const LiveVisitors = () => {
  const [visitors, setVisitors] = useState<ActiveVisitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [stats, setStats] = useState<Stats>({
    total: 0,
    newVisitors: 0,
    returningVisitors: 0,
    desktop: 0,
    mobile: 0,
    tablet: 0,
    countries: {},
    sources: {},
    pages: {},
    browsers: {},
    os: {},
    cities: {},
  });

  // Historical analytics state
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [pageViewStats, setPageViewStats] = useState<PageViewStats[]>([]);
  const [visitorsByDate, setVisitorsByDate] = useState<VisitorsByDate[]>([]);
  const [visitorsByCountry, setVisitorsByCountry] = useState<VisitorsByCountry[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const fetchVisitors = async () => {
    setLoading(true);
    try {
      await supabase.rpc("cleanup_stale_visitors");

      const { data, error } = await supabase
        .from("active_visitors")
        .select("*")
        .order("last_seen_at", { ascending: false });

      if (error) throw error;

      const visitorData = data || [];
      setVisitors(visitorData);
      setLastUpdate(new Date());

      const newStats: Stats = {
        total: visitorData.length,
        newVisitors: visitorData.filter((v) => v.is_new_visitor).length,
        returningVisitors: visitorData.filter((v) => !v.is_new_visitor).length,
        desktop: visitorData.filter((v) => v.device_type === "desktop").length,
        mobile: visitorData.filter((v) => v.device_type === "mobile").length,
        tablet: visitorData.filter((v) => v.device_type === "tablet").length,
        countries: {},
        sources: {},
        pages: {},
        browsers: {},
        os: {},
        cities: {},
      };

      visitorData.forEach((v) => {
        if (v.country) {
          if (!newStats.countries[v.country]) {
            newStats.countries[v.country] = { count: 0, code: v.country_code || 'XX' };
          }
          newStats.countries[v.country].count++;
        }
        if (v.traffic_source) {
          newStats.sources[v.traffic_source] = (newStats.sources[v.traffic_source] || 0) + 1;
        }
        if (v.current_page) {
          newStats.pages[v.current_page] = (newStats.pages[v.current_page] || 0) + 1;
        }
        if (v.browser) {
          newStats.browsers[v.browser] = (newStats.browsers[v.browser] || 0) + 1;
        }
        if (v.os) {
          newStats.os[v.os] = (newStats.os[v.os] || 0) + 1;
        }
        if (v.city) {
          newStats.cities[v.city] = (newStats.cities[v.city] || 0) + 1;
        }
      });

      setStats(newStats);
    } catch (error) {
      console.error("Error fetching visitors:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const startDate = startOfDay(dateRange.from).toISOString();
      const endDate = endOfDay(dateRange.to).toISOString();

      // Fetch page view stats
      const { data: pageStats, error: pageError } = await supabase.rpc(
        "get_page_view_stats",
        { start_date: startDate, end_date: endDate }
      );

      if (pageError) throw pageError;
      setPageViewStats((pageStats as PageViewStats[]) || []);

      // Fetch visitors by date
      const { data: dateStats, error: dateError } = await supabase.rpc(
        "get_visitors_per_date",
        { start_date: startDate, end_date: endDate }
      );

      if (dateError) throw dateError;
      setVisitorsByDate((dateStats as VisitorsByDate[]) || []);

      // Fetch visitors by country
      const { data: countryStats, error: countryError } = await supabase.rpc(
        "get_visitors_per_country",
        { start_date: startDate, end_date: endDate }
      );

      if (countryError) throw countryError;
      setVisitorsByCountry((countryStats as VisitorsByCountry[]) || []);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    fetchVisitors();

    const channel = supabase
      .channel("live_visitors_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "active_visitors",
        },
        () => {
          fetchVisitors();
        }
      )
      .subscribe();

    const interval = setInterval(fetchVisitors, 15000);

    return () => {
      channel.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const deviceTotal = stats.desktop + stats.mobile + stats.tablet;

  // Prepare chart data
  const visitorChartData = [...visitorsByDate]
    .reverse()
    .map((item) => ({
      date: format(new Date(item.visit_date), "MM/dd"),
      total: item.total_visitors,
      unique: item.unique_visitors,
      new: item.new_visitors,
      returning: item.returning_visitors,
    }));

  const totalHistoricalVisitors = visitorsByDate.reduce(
    (sum, d) => sum + d.total_visitors,
    0
  );
  const totalUniqueHistorical = visitorsByDate.reduce(
    (sum, d) => sum + d.unique_visitors,
    0
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-25" />
                <div className="relative p-3 bg-green-500/20 rounded-full">
                  <Activity className="h-6 w-6 text-green-500" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
                  تحليلات الزوار
                  <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 animate-pulse">
                    LIVE
                  </Badge>
                </h1>
                <p className="text-muted-foreground text-sm">
                  آخر تحديث: {format(lastUpdate, "hh:mm:ss a", { locale: ar })}
                </p>
              </div>
            </div>
            <Button onClick={fetchVisitors} disabled={loading} size="lg" className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              تحديث
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        <Tabs defaultValue="live" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="live" className="gap-2">
              <Activity className="h-4 w-4" />
              الزوار المباشرون
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <FileBarChart className="h-4 w-4" />
              التقارير التفصيلية
            </TabsTrigger>
          </TabsList>

          {/* Live Visitors Tab */}
          <TabsContent value="live" className="space-y-6 mt-6">
            {/* Main Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard icon={Users} value={stats.total} label="إجمالي الزوار" color="bg-primary" />
              <StatCard icon={UserPlus} value={stats.newVisitors} label="زوار جدد" color="bg-green-500" subValue={stats.total > 0 ? `${((stats.newVisitors / stats.total) * 100).toFixed(0)}%` : '0%'} />
              <StatCard icon={UserCheck} value={stats.returningVisitors} label="زوار عائدون" color="bg-blue-500" />
              <StatCard icon={Monitor} value={stats.desktop} label="سطح المكتب" color="bg-purple-500" />
              <StatCard icon={Smartphone} value={stats.mobile} label="الجوال" color="bg-orange-500" />
              <StatCard icon={Globe} value={Object.keys(stats.countries).length} label="دول مختلفة" color="bg-cyan-500" />
            </div>

            {/* Analytics Grid */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Countries */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  الدول
                </h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {Object.entries(stats.countries)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([country, data]) => (
                      <div key={country} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{getCountryFlag(data.code)}</span>
                          <span className="font-medium">{country}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${(data.count / stats.total) * 100}%` }} />
                          </div>
                          <Badge variant="secondary" className="min-w-[40px] justify-center">{data.count}</Badge>
                        </div>
                      </div>
                    ))}
                  {Object.keys(stats.countries).length === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-4">لا توجد بيانات</p>
                  )}
                </div>
              </Card>

              {/* Traffic Sources */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <ExternalLink className="h-5 w-5 text-primary" />
                  مصادر الزيارة
                </h3>
                <div className="space-y-3">
                  {Object.entries(stats.sources)
                    .sort((a, b) => b[1] - a[1])
                    .map(([source, count]) => (
                      <div key={source} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getSourceColor(source)}`} />
                          <span className="font-medium capitalize">{source}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full ${getSourceColor(source)}`} style={{ width: `${(count / stats.total) * 100}%` }} />
                          </div>
                          <Badge variant="secondary" className="min-w-[40px] justify-center">{count}</Badge>
                        </div>
                      </div>
                    ))}
                  {Object.keys(stats.sources).length === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-4">لا توجد بيانات</p>
                  )}
                </div>
              </Card>

              {/* Active Pages */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  الصفحات النشطة
                </h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {Object.entries(stats.pages)
                    .sort((a, b) => b[1] - a[1])
                    .map(([page, count]) => (
                      <div key={page} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <span className="font-mono text-sm truncate max-w-[180px]" title={page}>{page}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{count}</Badge>
                          <Badge variant="outline" className="text-xs">{((count / stats.total) * 100).toFixed(0)}%</Badge>
                        </div>
                      </div>
                    ))}
                  {Object.keys(stats.pages).length === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-4">لا توجد بيانات</p>
                  )}
                </div>
              </Card>
            </div>

            {/* Device & Browser Stats */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-primary" />
                  الأجهزة
                </h3>
                <div className="space-y-4">
                  <ProgressBar label="سطح المكتب" value={stats.desktop} total={deviceTotal} color="bg-purple-500" />
                  <ProgressBar label="الجوال" value={stats.mobile} total={deviceTotal} color="bg-orange-500" />
                  <ProgressBar label="التابلت" value={stats.tablet} total={deviceTotal} color="bg-cyan-500" />
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  المتصفحات
                </h3>
                <div className="space-y-3 max-h-40 overflow-y-auto">
                  {Object.entries(stats.browsers)
                    .sort((a, b) => b[1] - a[1])
                    .map(([browser, count]) => (
                      <div key={browser} className="flex justify-between items-center text-sm">
                        <span>{browser}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                  {Object.keys(stats.browsers).length === 0 && (
                    <p className="text-muted-foreground text-sm">لا توجد بيانات</p>
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  أنظمة التشغيل
                </h3>
                <div className="space-y-3 max-h-40 overflow-y-auto">
                  {Object.entries(stats.os)
                    .sort((a, b) => b[1] - a[1])
                    .map(([os, count]) => (
                      <div key={os} className="flex justify-between items-center text-sm">
                        <span>{os}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                  {Object.keys(stats.os).length === 0 && (
                    <p className="text-muted-foreground text-sm">لا توجد بيانات</p>
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  المدن
                </h3>
                <div className="space-y-3 max-h-40 overflow-y-auto">
                  {Object.entries(stats.cities)
                    .sort((a, b) => b[1] - a[1])
                    .map(([city, count]) => (
                      <div key={city} className="flex justify-between items-center text-sm">
                        <span>{city}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                  {Object.keys(stats.cities).length === 0 && (
                    <p className="text-muted-foreground text-sm">لا توجد بيانات</p>
                  )}
                </div>
              </Card>
            </div>

            {/* Visitors Table */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  تفاصيل الزوار ({visitors.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الدولة</TableHead>
                      <TableHead className="text-right">المدينة</TableHead>
                      <TableHead className="text-right">IP</TableHead>
                      <TableHead className="text-right">الجهاز</TableHead>
                      <TableHead className="text-right">المتصفح</TableHead>
                      <TableHead className="text-right">النظام</TableHead>
                      <TableHead className="text-right">الصفحة</TableHead>
                      <TableHead className="text-right">المصدر</TableHead>
                      <TableHead className="text-right">النوع</TableHead>
                      <TableHead className="text-right">آخر نشاط</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visitors.map((visitor) => (
                      <TableRow key={visitor.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{getCountryFlag(visitor.country_code)}</span>
                            <span>{visitor.country || "غير معروف"}</span>
                          </div>
                        </TableCell>
                        <TableCell>{visitor.city || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{visitor.ip_address || "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getDeviceIcon(visitor.device_type)}
                            <span className="capitalize">{visitor.device_type || "desktop"}</span>
                          </div>
                        </TableCell>
                        <TableCell>{visitor.browser || "-"}</TableCell>
                        <TableCell>{visitor.os || "-"}</TableCell>
                        <TableCell className="max-w-[150px] truncate font-mono text-xs" title={visitor.current_page}>
                          {visitor.current_page}
                        </TableCell>
                        <TableCell>{getSourceBadge(visitor.traffic_source)}</TableCell>
                        <TableCell>
                          <Badge variant={visitor.is_new_visitor ? "default" : "secondary"} className={visitor.is_new_visitor ? "bg-green-500/20 text-green-400 border-green-500/30" : ""}>
                            {visitor.is_new_visitor ? "جديد" : "عائد"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(visitor.last_seen_at), {
                              addSuffix: true,
                              locale: ar,
                            })}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {visitors.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Users className="h-12 w-12 opacity-20" />
                            <p>لا يوجد زوار نشطون حاليًا</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6 mt-6">
            {/* Date Range Picker */}
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium">الفترة الزمنية:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      {format(dateRange.from, "yyyy/MM/dd")} - {format(dateRange.to, "yyyy/MM/dd")}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range) => {
                        if (range?.from && range?.to) {
                          setDateRange({ from: range.from, to: range.to });
                        }
                      }}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}>
                    آخر 7 أيام
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}>
                    آخر 30 يوم
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDateRange({ from: subDays(new Date(), 90), to: new Date() })}>
                    آخر 90 يوم
                  </Button>
                </div>
                <Button onClick={fetchAnalytics} disabled={analyticsLoading} className="gap-2 mr-auto">
                  <RefreshCw className={`h-4 w-4 ${analyticsLoading ? "animate-spin" : ""}`} />
                  تحديث
                </Button>
              </div>
            </Card>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                icon={Eye}
                value={totalHistoricalVisitors.toLocaleString()}
                label="إجمالي الزيارات"
                color="bg-primary"
              />
              <StatCard
                icon={Users}
                value={totalUniqueHistorical.toLocaleString()}
                label="الزوار الفريدين"
                color="bg-green-500"
              />
              <StatCard
                icon={FileBarChart}
                value={pageViewStats.length}
                label="الصفحات المزارة"
                color="bg-purple-500"
              />
              <StatCard
                icon={Globe}
                value={visitorsByCountry.length}
                label="الدول"
                color="bg-cyan-500"
              />
            </div>

            {/* Visitors Over Time Chart */}
            <Card className="p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                الزوار حسب التاريخ
              </h3>
              {visitorChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={visitorChartData}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorUnique" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="إجمالي الزيارات"
                      stroke="#3b82f6"
                      fillOpacity={1}
                      fill="url(#colorTotal)"
                    />
                    <Area
                      type="monotone"
                      dataKey="unique"
                      name="الزوار الفريدين"
                      stroke="#10b981"
                      fillOpacity={1}
                      fill="url(#colorUnique)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  {analyticsLoading ? "جاري التحميل..." : "لا توجد بيانات للفترة المحددة"}
                </div>
              )}
            </Card>

            {/* Most Visited Pages & Countries */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Most Visited Pages */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  الصفحات الأكثر زيارة
                </h3>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {pageViewStats.slice(0, 20).map((page, index) => (
                    <div key={page.page_path} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground w-6">#{index + 1}</span>
                        <span className="font-mono text-sm truncate max-w-[200px]" title={page.page_path}>
                          {page.page_path}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-semibold">{page.view_count.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">{page.unique_visitors.toLocaleString()} فريد</div>
                        </div>
                        <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{
                              width: `${(page.view_count / (pageViewStats[0]?.view_count || 1)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {pageViewStats.length === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-8">لا توجد بيانات للفترة المحددة</p>
                  )}
                </div>
              </Card>

              {/* Visitors by Country */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  الزوار حسب الدولة
                </h3>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {visitorsByCountry.slice(0, 20).map((country, index) => (
                    <div key={country.country} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{getCountryFlag(country.country_code)}</span>
                        <span className="font-medium">{country.country}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-semibold">{country.total_visitors.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">{country.unique_visitors.toLocaleString()} فريد</div>
                        </div>
                        <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-500"
                            style={{
                              width: `${(country.total_visitors / (visitorsByCountry[0]?.total_visitors || 1)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {visitorsByCountry.length === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-8">لا توجد بيانات للفترة المحددة</p>
                  )}
                </div>
              </Card>
            </div>

            {/* Visitors by Date Table */}
            <Card className="p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-primary" />
                تفاصيل الزيارات اليومية
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">إجمالي الزيارات</TableHead>
                      <TableHead className="text-right">الزوار الفريدين</TableHead>
                      <TableHead className="text-right">زوار جدد</TableHead>
                      <TableHead className="text-right">زوار عائدون</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visitorsByDate.map((day) => (
                      <TableRow key={day.visit_date}>
                        <TableCell className="font-medium">
                          {format(new Date(day.visit_date), "yyyy/MM/dd EEEE", { locale: ar })}
                        </TableCell>
                        <TableCell>{day.total_visitors.toLocaleString()}</TableCell>
                        <TableCell>{day.unique_visitors.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                            {day.new_visitors.toLocaleString()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                            {day.returning_visitors.toLocaleString()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {visitorsByDate.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <CalendarIcon className="h-12 w-12 opacity-20" />
                            <p>لا توجد بيانات للفترة المحددة</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default LiveVisitors;
