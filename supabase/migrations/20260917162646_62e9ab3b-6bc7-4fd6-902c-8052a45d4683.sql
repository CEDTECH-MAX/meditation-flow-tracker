CREATE POLICY "directory photos readable by signed-in users"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'directory-photos');

CREATE POLICY "admins upload directory photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'directory-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins replace directory photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'directory-photos' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'directory-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins delete directory photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'directory-photos' AND public.has_role(auth.uid(), 'admin'));