CREATE TYPE public.institution AS ENUM ('MII', 'MIU');

ALTER TABLE public.profiles ADD COLUMN institution public.institution NOT NULL DEFAULT 'MII';
ALTER TABLE public.cohorts ADD COLUMN institution public.institution NOT NULL DEFAULT 'MII';
ALTER TABLE public.blocks ADD COLUMN institution public.institution NOT NULL DEFAULT 'MII';

CREATE TABLE public.class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  title text NOT NULL DEFAULT '',
  lecturer text,
  max_points numeric NOT NULL DEFAULT 2,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_sessions TO authenticated;
GRANT ALL ON public.class_sessions TO service_role;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "class sessions admin write" ON public.class_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "class sessions readable in own institution" ON public.class_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.blocks b
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE b.id = class_sessions.block_id AND b.institution = p.institution
  ));

CREATE TABLE public.class_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.class_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points numeric NOT NULL DEFAULT 0,
  mode text NOT NULL DEFAULT 'physical',
  comment text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX class_attendance_student_idx ON public.class_attendance(student_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_attendance TO authenticated;
GRANT ALL ON public.class_attendance TO service_role;
ALTER TABLE public.class_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "class attendance admin write" ON public.class_attendance
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "class attendance own select" ON public.class_attendance
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE OR REPLACE FUNCTION public.class_mode_valid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.mode NOT IN ('online', 'physical') THEN
    RAISE EXCEPTION 'Attendance type must be online or physical';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER class_attendance_mode_valid
  BEFORE INSERT OR UPDATE ON public.class_attendance
  FOR EACH ROW EXECUTE FUNCTION public.class_mode_valid();

CREATE TRIGGER class_sessions_touch BEFORE UPDATE ON public.class_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER class_attendance_touch BEFORE UPDATE ON public.class_attendance
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();