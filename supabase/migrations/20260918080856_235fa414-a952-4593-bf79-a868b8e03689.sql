
-- 1. Restrict SECURITY DEFINER helpers to answering only about the calling user
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$function$;

CREATE OR REPLACE FUNCTION public.has_role_text(_user_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role)
$function$;

CREATE OR REPLACE FUNCTION public.is_message_sender(_message_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = _message_id AND m.sender_id = _user_id)
$function$;

CREATE OR REPLACE FUNCTION public.is_message_recipient(_message_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (
       SELECT 1 FROM public.message_recipients r
       WHERE r.message_id = _message_id AND r.recipient_id = _user_id
     )
$function$;

-- 2. Markers may only be matched through an explicitly scoped, active assignment,
--    and only when asking about themselves.
CREATE OR REPLACE FUNCTION public.marker_can_mark_student(_marker_id uuid, _student_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT (auth.uid() IS NULL OR _marker_id = auth.uid())
     AND EXISTS (
    SELECT 1
    FROM public.marker_assignments a
    JOIN public.profiles p ON p.id = _student_id
    JOIN public.profiles m ON m.id = _marker_id
    WHERE a.marker_id = _marker_id
      AND a.is_active
      AND m.institution = p.institution
      AND (a.cohort_id IS NOT NULL OR a.classification IS NOT NULL OR a.gender IS NOT NULL)
      AND (a.cohort_id IS NULL OR a.cohort_id = p.cohort_id)
      AND (a.classification IS NULL OR a.classification = p.classification)
      AND (a.gender IS NULL OR a.gender = p.gender)
      AND (a.block_id IS NULL OR a.block_id = _block_id)
  )
$function$;

-- 3. Class attendance: read access for the head of meditation and assigned markers
DROP POLICY IF EXISTS "class attendance marker select" ON public.class_attendance;
CREATE POLICY "class attendance marker select"
ON public.class_attendance FOR SELECT TO authenticated
USING (
  public.has_role_text(auth.uid(), 'head_of_meditation')
  OR EXISTS (
    SELECT 1 FROM public.class_sessions s
    WHERE s.id = class_attendance.session_id
      AND public.marker_can_mark_student(auth.uid(), class_attendance.student_id, s.block_id)
  )
);

-- 4. Storage: private export bucket restricted to admins only
DROP POLICY IF EXISTS "admins read private export files" ON storage.objects;
CREATE POLICY "admins read private export files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id <> 'directory-photos' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins write private export files" ON storage.objects;
CREATE POLICY "admins write private export files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id <> 'directory-photos' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins update private export files" ON storage.objects;
CREATE POLICY "admins update private export files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id <> 'directory-photos' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id <> 'directory-photos' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins delete private export files" ON storage.objects;
CREATE POLICY "admins delete private export files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id <> 'directory-photos' AND public.has_role(auth.uid(), 'admin'));
