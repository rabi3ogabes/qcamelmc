import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

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
  countries: Record<string, number>;
  sources: Record<string, number>;
  pages: Record<string, number>;
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

const getSourceBadge = (source: string | null) => {
  const sourceColors: Record<string, string> = {
    direct: "bg-blue-500/20 text-blue-400",
    google: "bg-red-500/20 text-red-400",
    facebook: "bg-indigo-500/20 text-indigo-400",
    twitter: "bg-sky-500/20 text-sky-400",
    instagram: "bg-pink-500/20 text-pink-400",
    whatsapp: "bg-green-500/20 text-green-400",
    telegram: "bg-cyan-500/20 text-cyan-400",
    youtube: "bg-red-600/20 text-red-500",
    referral: "bg-purple-500/20 text-purple-400",
    internal: "bg-gray-500/20 text-gray-400",
  };

  const colorClass = sourceColors[source || "direct"] || "bg-muted text-muted-foreground";
  
  return (
    <Badge variant="outline" className={colorClass}>
      {source || "direct"}
    </Badge>
  );
};

export const VisitorAnalyticsTab = () => {
  const [visitors, setVisitors] = useState<ActiveVisitor[]>([]);
  const [loading, setLoading] = useState(true);
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
  });

  const fetchVisitors = async () => {
    setLoading(true);
    try {
      // First cleanup stale visitors (older than 5 minutes)
      await supabase.rpc("cleanup_stale_visitors");

      const { data, error } = await supabase
        .from("active_visitors")
        .select("*")
        .order("last_seen_at", { ascending: false });

      if (error) throw error;

      const visitorData = data || [];
      setVisitors(visitorData);

      // Calculate stats
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
      };

      visitorData.forEach((v) => {
        if (v.country) {
          newStats.countries[v.country] = (newStats.countries[v.country] || 0) + 1;
        }
        if (v.traffic_source) {
          newStats.sources[v.traffic_source] = (newStats.sources[v.traffic_source] || 0) + 1;
        }
        if (v.current_page) {
          newStats.pages[v.current_page] = (newStats.pages[v.current_page] || 0) + 1;
        }
      });

      setStats(newStats);
    } catch (error) {
      console.error("Error fetching visitors:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearAllVisitors = async () => {
    if (!confirm("هل أنت متأكد من حذف جميع بيانات الزوار؟")) return;
    
    try {
      const { error } = await supabase.from("active_visitors").delete().neq("id", "");
      if (error) throw error;
      fetchVisitors();
    } catch (error) {
      console.error("Error clearing visitors:", error);
    }
  };

  useEffect(() => {
    fetchVisitors();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("active_visitors_changes")
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

    // Refresh every 30 seconds
    const interval = setInterval(fetchVisitors, 30000);

    return () => {
      channel.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">الزوار النشطون</h2>
          <p className="text-muted-foreground">مراقبة الزوار في الوقت الفعلي</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchVisitors} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
          <Button variant="destructive" onClick={clearAllVisitors}>
            <Trash2 className="h-4 w-4 ml-2" />
            مسح الكل
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">إجمالي الزوار</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <UserPlus className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.newVisitors}</p>
              <p className="text-xs text-muted-foreground">زوار جدد</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <UserCheck className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.returningVisitors}</p>
              <p className="text-xs text-muted-foreground">زوار عائدون</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Monitor className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.desktop}</p>
              <p className="text-xs text-muted-foreground">سطح المكتب</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <Smartphone className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.mobile}</p>
              <p className="text-xs text-muted-foreground">الجوال</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-lg">
              <Tablet className="h-5 w-5 text-cyan-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.tablet}</p>
              <p className="text-xs text-muted-foreground">التابلت</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Countries & Sources Summary */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4" />
            الدول
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {Object.entries(stats.countries)
              .sort((a, b) => b[1] - a[1])
              .map(([country, count]) => (
                <div key={country} className="flex justify-between items-center text-sm">
                  <span>{country}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
            {Object.keys(stats.countries).length === 0 && (
              <p className="text-muted-foreground text-sm">لا توجد بيانات</p>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            مصادر الزيارة
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {Object.entries(stats.sources)
              .sort((a, b) => b[1] - a[1])
              .map(([source, count]) => (
                <div key={source} className="flex justify-between items-center text-sm">
                  {getSourceBadge(source)}
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
            {Object.keys(stats.sources).length === 0 && (
              <p className="text-muted-foreground text-sm">لا توجد بيانات</p>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            الصفحات النشطة
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {Object.entries(stats.pages)
              .sort((a, b) => b[1] - a[1])
              .map(([page, count]) => (
                <div key={page} className="flex justify-between items-center text-sm">
                  <span className="truncate max-w-[150px]" title={page}>
                    {page}
                  </span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
            {Object.keys(stats.pages).length === 0 && (
              <p className="text-muted-foreground text-sm">لا توجد بيانات</p>
            )}
          </div>
        </Card>
      </div>

      {/* Visitors Table */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">تفاصيل الزوار</h3>
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
                <TableRow key={visitor.id}>
                  <TableCell>
                    <span className="text-lg ml-2">{getCountryFlag(visitor.country_code)}</span>
                    {visitor.country || "غير معروف"}
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
                  <TableCell className="max-w-[150px] truncate" title={visitor.current_page}>
                    {visitor.current_page}
                  </TableCell>
                  <TableCell>{getSourceBadge(visitor.traffic_source)}</TableCell>
                  <TableCell>
                    <Badge variant={visitor.is_new_visitor ? "default" : "secondary"}>
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
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    لا يوجد زوار نشطون حاليًا
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};
