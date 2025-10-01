-- Fix infinite recursion in admin_users RLS policy
DROP POLICY IF EXISTS "Admins can view admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Users can view their own admin status" ON public.admin_users;

-- Create a security definer function to check admin status safely
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE id = user_id
  )
$$;

-- Create new policies using the function
CREATE POLICY "Admins can view admin users"
  ON public.admin_users FOR SELECT
  USING (public.is_admin(auth.uid()));