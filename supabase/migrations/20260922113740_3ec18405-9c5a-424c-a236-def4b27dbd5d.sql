
CREATE OR REPLACE FUNCTION public.is_developer(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'developer')
$$;

CREATE TABLE public.auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  event text NOT NULL,
  succeeded boolean NOT NULL DEFAULT false,
  reason text,
  role text,
  institution text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.auth_events TO authenticated;
GRANT ALL ON public.auth_events TO service_role;
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth events developer read" ON public.auth_events FOR SELECT TO authenticated USING (public.is_developer(auth.uid()));
CREATE INDEX auth_events_created_idx ON public.auth_events (created_at DESC);
CREATE INDEX auth_events_email_idx ON public.auth_events (lower(email));

CREATE TABLE public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  detail text,
  institution text,
  ip text,
  user_agent text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "security events developer read" ON public.security_events FOR SELECT TO authenticated USING (public.is_developer(auth.uid()));
CREATE POLICY "security events developer resolve" ON public.security_events FOR UPDATE TO authenticated USING (public.is_developer(auth.uid())) WITH CHECK (public.is_developer(auth.uid()));
CREATE INDEX security_events_created_idx ON public.security_events (created_at DESC);

CREATE TABLE public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  subject text NOT NULL,
  template text,
  institution text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  attempts integer NOT NULL DEFAULT 0,
  related_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email events developer read" ON public.email_events FOR SELECT TO authenticated USING (public.is_developer(auth.uid()));
CREATE TRIGGER email_events_touch BEFORE UPDATE ON public.email_events FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX email_events_created_idx ON public.email_events (created_at DESC);

CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  label text NOT NULL,
  description text,
  institution text,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, institution)
);
GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature flags readable" ON public.feature_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY "feature flags developer write" ON public.feature_flags FOR ALL TO authenticated USING (public.is_developer(auth.uid())) WITH CHECK (public.is_developer(auth.uid()));
CREATE TRIGGER feature_flags_touch BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.system_controls (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_controls TO authenticated;
GRANT ALL ON public.system_controls TO service_role;
ALTER TABLE public.system_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system controls readable" ON public.system_controls FOR SELECT TO authenticated USING (true);
CREATE POLICY "system controls developer write" ON public.system_controls FOR ALL TO authenticated USING (public.is_developer(auth.uid())) WITH CHECK (public.is_developer(auth.uid()));
CREATE TRIGGER system_controls_touch BEFORE UPDATE ON public.system_controls FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  reason text NOT NULL,
  read_only boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.support_sessions TO authenticated;
GRANT ALL ON public.support_sessions TO service_role;
ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "support sessions developer read" ON public.support_sessions FOR SELECT TO authenticated USING (public.is_developer(auth.uid()));

INSERT INTO public.system_controls (key, label, description, enabled) VALUES
  ('maintenance_mode', 'Maintenance mode', 'Shows a maintenance notice across the platform.', false),
  ('disable_marking', 'Disable marking', 'Blocks all attendance marking for markers and admins.', false),
  ('disable_logins', 'Disable sign-in', 'Prevents everyone except the developer from signing in.', false),
  ('disable_email', 'Pause notification emails', 'Queues notification emails instead of sending them.', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.feature_flags (key, label, description, institution, enabled) VALUES
  ('appeals', 'Attendance appeals', 'Students can appeal a marked session.', 'MII', true),
  ('appeals', 'Attendance appeals', 'Students can appeal a marked session.', 'MIU', true),
  ('session_reviews', 'Session reviews', 'Students can rate a completed session.', 'MII', true),
  ('session_reviews', 'Session reviews', 'Students can rate a completed session.', 'MIU', true),
  ('ai_advisor', 'AI advisor', 'Students can chat with the attendance advisor.', 'MII', true),
  ('ai_advisor', 'AI advisor', 'Students can chat with the attendance advisor.', 'MIU', true),
  ('mail', 'Internal mail', 'Internal mailbox for everyone in the institution.', 'MII', true),
  ('mail', 'Internal mail', 'Internal mailbox for everyone in the institution.', 'MIU', true),
  ('class_register', 'Class register', 'Class attendance register and reports.', 'MII', true),
  ('class_register', 'Class register', 'Class attendance register and reports.', 'MIU', true)
ON CONFLICT (key, institution) DO NOTHING;
