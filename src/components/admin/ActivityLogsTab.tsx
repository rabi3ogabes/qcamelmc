import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Loader2, Search, FileText, ScanLine, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface ActivityLog {
  id: string;
  created_at: string;
  activity_type: 'pos_form' | 'qr_search' | 'ticket_scan';
  user_type: 'admin' | 'guest' | 'system';
  user_identifier: string | null;
  action_data: Record<string, any>;
  metadata: Record<string, any>;
  user_agent: string | null;
}

export const ActivityLogsTab = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"all" | "pos_form" | "qr_search" | "ticket_scan">("all");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('activity_logs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activity_logs'
        },
        () => {
          fetchLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setLogs((data as ActivityLog[]) || []);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      toast.error('فشل في تحميل السجلات');
    } finally {
      setLoading(false);
    }
  };

  const deleteLog = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase
        .from('activity_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('تم حذف السجل بنجاح');
      fetchLogs();
    } catch (error) {
      console.error('Failed to delete log:', error);
      toast.error('فشل في حذف السجل');
    } finally {
      setDeleting(null);
    }
  };

  const deleteAllLogs = async () => {
    if (!confirm('هل أنت متأكد من حذف جميع السجلات؟ لا يمكن التراجع عن هذا الإجراء.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('activity_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;
      toast.success('تم حذف جميع السجلات بنجاح');
      fetchLogs();
    } catch (error) {
      console.error('Failed to delete all logs:', error);
      toast.error('فشل في حذف السجلات');
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'pos_form':
        return <FileText className="w-4 h-4" />;
      case 'qr_search':
        return <Search className="w-4 h-4" />;
      case 'ticket_scan':
        return <ScanLine className="w-4 h-4" />;
      default:
        return <Filter className="w-4 h-4" />;
    }
  };

  const getActivityLabel = (type: string) => {
    switch (type) {
      case 'pos_form':
        return 'نموذج POS';
      case 'qr_search':
        return 'بحث QR';
      case 'ticket_scan':
        return 'فحص تذكرة';
      default:
        return type;
    }
  };

  const getUserTypeLabel = (type: string) => {
    switch (type) {
      case 'admin':
        return 'مدير';
      case 'guest':
        return 'ضيف';
      case 'system':
        return 'نظام';
      default:
        return type;
    }
  };

  const getUserTypeBadgeVariant = (type: string): "default" | "secondary" | "outline" => {
    switch (type) {
      case 'admin':
        return 'default';
      case 'guest':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const filteredLogs = logs.filter(log => 
    filterType === "all" || log.activity_type === filterType
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl md:text-2xl font-bold mb-2">سجلات النشاط</h2>
            <p className="text-sm md:text-base text-muted-foreground">
              تتبع جميع الأنشطة في النظام (عمليات البحث وإدخال البيانات)
            </p>
          </div>
          <Button
            onClick={deleteAllLogs}
            variant="destructive"
            size="sm"
            className="w-full sm:w-auto"
          >
            <Trash2 className="w-4 h-4 ml-2" />
            حذف جميع السجلات ({logs.length})
          </Button>
        </div>

        <Tabs value={filterType} onValueChange={(v) => setFilterType(v as any)} className="w-full">
          <div className="mb-4">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
              <TabsTrigger value="all" className="text-xs sm:text-sm">
                الكل ({logs.length})
              </TabsTrigger>
              <TabsTrigger value="pos_form" className="text-xs sm:text-sm">
                POS ({logs.filter(l => l.activity_type === 'pos_form').length})
              </TabsTrigger>
              <TabsTrigger value="qr_search" className="text-xs sm:text-sm">
                بحث ({logs.filter(l => l.activity_type === 'qr_search').length})
              </TabsTrigger>
              <TabsTrigger value="ticket_scan" className="text-xs sm:text-sm">
                مسح ({logs.filter(l => l.activity_type === 'ticket_scan').length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={filterType} className="mt-0">
            <div className="rounded-md border overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right whitespace-nowrap">النوع</TableHead>
                    <TableHead className="text-right whitespace-nowrap">المستخدم</TableHead>
                    <TableHead className="text-right whitespace-nowrap">المعرف</TableHead>
                    <TableHead className="text-right whitespace-nowrap">البيانات</TableHead>
                    <TableHead className="text-right whitespace-nowrap">التاريخ والوقت</TableHead>
                    <TableHead className="text-right whitespace-nowrap">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        لا توجد سجلات
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getActivityIcon(log.activity_type)}
                            <span className="text-xs sm:text-sm">{getActivityLabel(log.activity_type)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getUserTypeBadgeVariant(log.user_type)} className="text-xs">
                            {getUserTypeLabel(log.user_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm">
                          {log.user_identifier || '-'}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <details className="cursor-pointer">
                            <summary className="text-xs text-muted-foreground hover:text-foreground">
                              عرض البيانات
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                              {JSON.stringify(log.action_data, null, 2)}
                            </pre>
                          </details>
                        </TableCell>
                        <TableCell className="text-xs" dir="ltr">
                          {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ar })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteLog(log.id)}
                            disabled={deleting === log.id}
                          >
                            {deleting === log.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4 text-destructive" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};
