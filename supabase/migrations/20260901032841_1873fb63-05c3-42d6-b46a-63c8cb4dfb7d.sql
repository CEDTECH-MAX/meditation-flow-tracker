REVOKE ALL ON FUNCTION public.has_role_text(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marker_can_mark_student(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role_text(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marker_can_mark_student(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;