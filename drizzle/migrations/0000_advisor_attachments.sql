ALTER TABLE public.advisor_messages ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE POLICY "advisor attachments own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'advisor-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "advisor attachments own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'advisor-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);