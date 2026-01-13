import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, User } from "lucide-react";

interface POSUser {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export const POSUsersTab = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<POSUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserName, setNewUserName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("pos_users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error fetching POS users:", error);
      toast({
        title: "خطأ",
        description: "فشل تحميل مستخدمي نقطة البيع",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserName.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم المستخدم",
        variant: "destructive",
      });
      return;
    }

    setAdding(true);
    try {
      const { error } = await supabase
        .from("pos_users")
        .insert({ name: newUserName.trim() });

      if (error) throw error;

      toast({
        title: "تم",
        description: "تم إضافة المستخدم بنجاح",
      });
      setNewUserName("");
      fetchUsers();
    } catch (error) {
      console.error("Error adding POS user:", error);
      toast({
        title: "خطأ",
        description: "فشل إضافة المستخدم",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("pos_users")
        .update({ is_active: isActive })
        .eq("id", userId);

      if (error) throw error;

      toast({
        title: "تم",
        description: isActive ? "تم تفعيل المستخدم" : "تم تعطيل المستخدم",
      });
      fetchUsers();
    } catch (error) {
      console.error("Error toggling POS user:", error);
      toast({
        title: "خطأ",
        description: "فشل تحديث حالة المستخدم",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المستخدم؟")) return;

    try {
      const { error } = await supabase
        .from("pos_users")
        .delete()
        .eq("id", userId);

      if (error) throw error;

      toast({
        title: "تم",
        description: "تم حذف المستخدم بنجاح",
      });
      fetchUsers();
    } catch (error) {
      console.error("Error deleting POS user:", error);
      toast({
        title: "خطأ",
        description: "فشل حذف المستخدم - قد يكون مرتبطاً بطلبات",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="text-center py-8">جاري التحميل...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-lusail">
          <User className="w-5 h-5" />
          مستخدمي نقطة البيع
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add new user */}
        <div className="flex gap-2">
          <Input
            placeholder="اسم المستخدم الجديد"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddUser()}
            className="font-lusail"
          />
          <Button onClick={handleAddUser} disabled={adding} className="font-lusail">
            <Plus className="w-4 h-4 ml-2" />
            إضافة
          </Button>
        </div>

        {/* Users list */}
        {users.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground font-lusail">
            لا يوجد مستخدمين. أضف مستخدم جديد للبدء.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right font-lusail">الاسم</TableHead>
                <TableHead className="text-right font-lusail">الحالة</TableHead>
                <TableHead className="text-right font-lusail">تاريخ الإنشاء</TableHead>
                <TableHead className="text-right font-lusail">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-lusail font-medium">{user.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={user.is_active}
                      onCheckedChange={(checked) => handleToggleActive(user.id, checked)}
                    />
                  </TableCell>
                  <TableCell className="font-lusail text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString("ar-QA")}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
