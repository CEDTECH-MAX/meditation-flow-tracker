ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS points numeric(3,1) NOT NULL DEFAULT 0;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_points_range CHECK (points >= 0 AND points <= 2);

UPDATE public.attendance
SET points = CASE
  WHEN status = 'present' AND absence_reason = 'late_arrival' THEN 1.5
  WHEN status = 'present' THEN 2.0
  ELSE 0
END;

CREATE TABLE public.advisor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX advisor_messages_user_created_idx
  ON public.advisor_messages (user_id, created_at);

GRANT SELECT, INSERT ON public.advisor_messages TO authenticated;
GRANT ALL ON public.advisor_messages TO service_role;

ALTER TABLE public.advisor_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor messages select" ON public.advisor_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "advisor messages insert" ON public.advisor_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());