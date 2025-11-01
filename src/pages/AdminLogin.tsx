import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock } from "lucide-react";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  const navigate = useNavigate();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("logo_url, header_bg_color")
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    if (data?.logo_url) {
      setLogoUrl(data.logo_url);
    }
    
    if (data?.header_bg_color) {
      setHeaderBgColor(data.header_bg_color);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Check if user is an admin
      const { data: adminUser, error: adminError } = await supabase
        .from("admin_users")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (adminError || !adminUser) {
        await supabase.auth.signOut();
        throw new Error("Unauthorized: Admin access only");
      }

      toast.success("Logged in successfully!");
      navigate("/admin/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Failed to log in");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b backdrop-blur-sm sticky top-0 z-10" style={{ backgroundColor: headerBgColor }}>
        <div className="container mx-auto px-4 py-4 flex justify-center items-center">
          <button onClick={() => navigate("/")} className="focus:outline-none hover:opacity-80 transition-opacity">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-12 object-contain" />
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </Button>
        </form>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground mb-2 text-center hidden">Demo Credentials</p>
          <Button
            variant="outline"
            className="w-full text-sm"
            onClick={async () => {
              const demoEmail = "rabii.souai@gmail.com";
              const demoPassword = "@@@Qatar123";
              setEmail(demoEmail);
              setPassword(demoPassword);
              setLoading(true);

              try {
                const { data, error } = await supabase.auth.signInWithPassword({
                  email: demoEmail,
                  password: demoPassword,
                });

                if (error) throw error;

                const { data: adminUser, error: adminError } = await supabase
                  .from("admin_users")
                  .select("*")
                  .eq("id", data.user.id)
                  .single();

                if (adminError || !adminUser) {
                  await supabase.auth.signOut();
                  throw new Error("Unauthorized: Admin access only");
                }

                toast.success("Logged in successfully!");
                navigate("/admin/dashboard");
              } catch (error: any) {
                toast.error(error.message || "Failed to log in");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            {loading ? "Logging in..." : "Click to use: rabii.souai@gmail.com / @@@Qatar123"}
          </Button>
        </div>

          <div className="mt-4 text-center">
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
