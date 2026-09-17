DROP FUNCTION IF EXISTS public.marker_cohort_ids(uuid);

REVOKE EXECUTE ON FUNCTION public.marker_can_mark_student(uuid, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role_text(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.marker_can_mark_student(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role_text(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;