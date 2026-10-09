import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/contexts/SettingsContext";
import { useAdminSession } from "@/hooks/useAdminSession";

/** Where to go after signing in: the admin page that sent us here, never an arbitrary address. */
function destinationAfterLogin(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === "string" && /^\/(admin|live-bookings)(\/|$)/.test(from) ? from : "/admin/dashboard";
}

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const session = useAdminSession();

  // Someone who is not an administrator must not stay signed in on this device.
  useEffect(() => {
    if (session.status === "not_admin") {
      supabase.auth.signOut().then(() => toast.error("هذا الحساب ليس حساب مسؤول"));
    }
  }, [session.status]);

  if (session.status === "admin") {
    return <Navigate to={destinationAfterLogin(location.state)} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      // useAdminSession now confirms admin-ness with the database and redirects (or signs out).
    } catch (error) {
      toast.error(error instanceof Error && error.message ? "البريد الإلكتروني أو كلمة المرور غير صحيحة" : "Failed to log in");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b backdrop-blur-sm sticky top-0 z-10" style={{ backgroundColor: settings?.header_bg_color }}>
        <div className="container mx-auto px-4 py-4 flex justify-center items-center">
          <button onClick={() => navigate("/")} className="focus:outline-none hover:opacity-80 transition-opacity">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="h-12 object-contain" />
            ) : (
              <h1 className="text-2xl font-bold">Admin Login</h1>
            )}
          </button>
        </div>
      </header>

      <div className="flex items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Admin Login</h1>
            <p className="text-muted-foreground">Access the admin dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Logging in..." : "Login"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Button variant="ghost" onClick={() => navigate("/")}>
              ← Back to Home
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminLogin;
