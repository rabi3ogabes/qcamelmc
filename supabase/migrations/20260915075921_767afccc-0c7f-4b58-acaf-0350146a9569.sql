CREATE TABLE public.staff_attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pos_user_id uuid NOT NULL REFERENCES public.pos_users(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present','absent')),
  marked_by uuid,
  marked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX staff_attendance_user_date_idx ON public.staff_attendance (pos_user_id, attendance_date);
CREATE INDEX staff_attendance_date_idx ON public.staff_attendance (attendance_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_attendance TO authenticated;
GRANT ALL ON public.staff_attendance TO service_role;

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view attendance"
  ON public.staff_attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert attendance"
  ON public.staff_attendance FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update attendance"
  ON public.staff_attendance FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff can delete attendance"
  ON public.staff_attendance FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_staff_attendance_updated_at
  BEFORE UPDATE ON public.staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();