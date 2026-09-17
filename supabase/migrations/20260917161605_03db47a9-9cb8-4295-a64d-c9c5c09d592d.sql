ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

CREATE TABLE public.departments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  institution public.institution NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read departments"
  ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage departments"
  ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER departments_touch BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.profiles
  ADD COLUMN department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id uuid NOT NULL DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  is_draft boolean NOT NULL DEFAULT false,
  sender_folder text NOT NULL DEFAULT 'sent',
  sender_starred boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_sender_folder_valid CHECK (sender_folder IN ('sent', 'trash'))
);

CREATE TABLE public.message_recipients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'to',
  folder text NOT NULL DEFAULT 'inbox',
  read_at timestamptz,
  is_starred boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_recipients_kind_valid CHECK (kind IN ('to', 'cc')),
  CONSTRAINT message_recipients_folder_valid CHECK (folder IN ('inbox', 'archive', 'trash')),
  UNIQUE (message_id, recipient_id)
);

CREATE INDEX messages_sender_idx ON public.messages (sender_id, created_at DESC);
CREATE INDEX messages_thread_idx ON public.messages (thread_id, created_at);
CREATE INDEX message_recipients_recipient_idx ON public.message_recipients (recipient_id, folder);

CREATE OR REPLACE FUNCTION public.is_message_sender(_message_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.messages m WHERE m.id = _message_id AND m.sender_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_message_recipient(_message_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.message_recipients r
    WHERE r.message_id = _message_id AND r.recipient_id = _user_id
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_message_sender(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_message_recipient(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_message_sender(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_message_recipient(uuid, uuid) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or received messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR (is_draft = false AND public.is_message_recipient(id, auth.uid()))
  );
CREATE POLICY "Send own messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());
CREATE POLICY "Update own messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());
CREATE POLICY "Delete own messages"
  ON public.messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

CREATE TRIGGER messages_touch BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_recipients TO authenticated;
GRANT ALL ON public.message_recipients TO service_role;
ALTER TABLE public.message_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own recipient rows"
  ON public.message_recipients FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR public.is_message_sender(message_id, auth.uid()));
CREATE POLICY "Sender adds recipients"
  ON public.message_recipients FOR INSERT TO authenticated
  WITH CHECK (public.is_message_sender(message_id, auth.uid()));
CREATE POLICY "Recipient updates own row"
  ON public.message_recipients FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
CREATE POLICY "Sender removes recipients"
  ON public.message_recipients FOR DELETE TO authenticated
  USING (public.is_message_sender(message_id, auth.uid()));