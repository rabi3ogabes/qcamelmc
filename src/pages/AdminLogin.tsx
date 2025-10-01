import { useState } from "react";
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
  const [isSignup, setIsSignup] = useState(false);
  const navigate = useNavigate();

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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // First create the auth user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        // Add user to admin_users table
        const { error: adminError } = await supabase
          .from("admin_users")
          .insert({ id: data.user.id, email: data.user.email! });

        if (adminError) throw adminError;

        toast.success("Admin account created! You can now log in.");
        setIsSignup(false);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create admin account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">
            {isSignup ? "Create Admin Account" : "Admin Login"}
          </h1>
          <p className="text-muted-foreground">
            {isSignup ? "Set up your admin account" : "Access the admin dashboard"}
          </p>
        </div>

        <form onSubmit={isSignup ? handleSignup : handleLogin} className="space-y-4">
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
            {loading ? (isSignup ? "Creating Account..." : "Logging in...") : (isSignup ? "Create Account" : "Login")}
          </Button>
        </form>

        {!isSignup && (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-border">
            <p className="text-sm text-muted-foreground mb-2 text-center">Demo Credentials</p>
            <Button
              variant="outline"
              className="w-full text-sm"
              onClick={() => {
                setEmail("admin@example.com");
                setPassword("admin123");
                toast.info("Credentials filled");
              }}
            >
              Click to use: admin@example.com / admin123
            </Button>
          </div>
        )}

        <div className="mt-4 text-center space-y-2">
          <Button
            variant="link"
            onClick={() => {
              setIsSignup(!isSignup);
              setEmail("");
              setPassword("");
            }}
          >
            {isSignup ? "Already have an account? Log in" : "Need to create an admin account? Sign up"}
          </Button>
          <div>
            <Button variant="ghost" onClick={() => navigate("/")}>
              ← Back to Home
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AdminLogin;
