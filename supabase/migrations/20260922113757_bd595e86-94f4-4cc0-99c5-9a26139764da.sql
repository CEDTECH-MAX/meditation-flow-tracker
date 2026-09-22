REVOKE EXECUTE ON FUNCTION public.is_developer(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_developer(uuid) TO authenticated, service_role;