CREATE TABLE public.sheet_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution public.institution NOT NULL,
  block_id uuid NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  label text NOT NULL,
  spreadsheet_id text NOT NULL,
  spreadsheet_url text NOT NULL,
  sheet_name text NOT NULL,
  webhook_secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_direction text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (block_id, spreadsheet_id, sheet_name)
);

CREATE INDEX sheet_links_block_idx ON public.sheet_links (block_id);
CREATE INDEX sheet_links_inst_idx ON public.sheet_links (institution);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sheet_links TO authenticated;
GRANT ALL ON public.sheet_links TO service_role;

ALTER TABLE public.sheet_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage own institution sheet links"
  ON public.sheet_links
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND institution::text = public.my_institution()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND institution::text = public.my_institution()
  );

CREATE POLICY "developers view all sheet links"
  ON public.sheet_links
  FOR SELECT
  TO authenticated
  USING (public.is_developer(auth.uid()));