create or replace function public.my_institution()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select institution::text from public.profiles where id = auth.uid()
$$;

revoke execute on function public.my_institution() from anon, public;
grant execute on function public.my_institution() to authenticated, service_role;

drop policy if exists "blocks readable" on public.blocks;
create policy "blocks readable" on public.blocks for select to authenticated
using (public.is_developer(auth.uid()) or institution::text = public.my_institution());

drop policy if exists "Signed-in users can read departments" on public.departments;
create policy "Signed-in users can read departments" on public.departments for select to authenticated
using (public.is_developer(auth.uid()) or institution::text = public.my_institution());

drop policy if exists "feature flags readable" on public.feature_flags;
create policy "feature flags readable" on public.feature_flags for select to authenticated
using (
  public.is_developer(auth.uid())
  or institution is null
  or institution::text = public.my_institution()
);

drop policy if exists "system controls readable" on public.system_controls;
create policy "system controls readable" on public.system_controls for select to authenticated
using (public.is_developer(auth.uid()) or public.has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "directory photos readable by signed-in users" on storage.objects;
create policy "directory photos readable by signed-in users" on storage.objects for select to authenticated
using (
  bucket_id = 'directory-photos'
  and (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.is_developer(auth.uid())
    or owner_id = (select auth.uid()::text)
    or (storage.foldername(name))[1] = (select auth.uid()::text)
  )
);