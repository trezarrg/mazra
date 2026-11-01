-- Hapus fungsi akses dari aplikasi lama yang tidak lagi digunakan fondasi baru.
-- Tanpa CASCADE agar berhenti jika masih ada objek lain yang bergantung padanya.
begin;
drop function if exists app_private.can_approve(text, uuid[]);
drop function if exists app_private.handle_auth_user_created();
drop function if exists app_private.has_permission(text);
drop function if exists app_private.has_role(text[]);
drop function if exists app_private.has_app_access();
drop schema if exists app_private restrict;
notify pgrst, 'reload schema';
commit;
