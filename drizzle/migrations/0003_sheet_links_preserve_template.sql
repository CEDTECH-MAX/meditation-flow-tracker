ALTER TABLE public.sheet_links
  DROP CONSTRAINT IF EXISTS sheet_links_block_id_fkey;

ALTER TABLE public.sheet_links
  ALTER COLUMN block_id DROP NOT NULL;

ALTER TABLE public.sheet_links
  ADD CONSTRAINT sheet_links_block_id_fkey
  FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE SET NULL;