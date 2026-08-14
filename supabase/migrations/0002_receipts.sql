-- Receipt image storage. Run once in the Supabase SQL editor after 0001.
-- Adds a receipt reference to transactions and a private, owner-scoped bucket.

alter table public.transactions add column if not exists receipt_path text;

-- Private bucket for receipt images.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Owner-only access: object paths are "<user-id>/<file>", so the first folder
-- segment must equal the caller's uid.
drop policy if exists receipts_insert_own on storage.objects;
drop policy if exists receipts_select_own on storage.objects;
drop policy if exists receipts_update_own on storage.objects;
drop policy if exists receipts_delete_own on storage.objects;

create policy receipts_insert_own on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy receipts_select_own on storage.objects for select
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy receipts_update_own on storage.objects for update
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy receipts_delete_own on storage.objects for delete
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
