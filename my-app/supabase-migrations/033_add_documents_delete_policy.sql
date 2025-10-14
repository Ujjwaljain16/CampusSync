-- Add DELETE policy for documents table so students can delete their own documents

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='Students can delete own documents'
  ) then
    create policy "Students can delete own documents"
      on public.documents for delete to authenticated
      using (auth.uid() = student_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='Admins can delete any documents'
  ) then
    create policy "Admins can delete any documents"
      on public.documents for delete to authenticated
      using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));
  end if;
end $$;
