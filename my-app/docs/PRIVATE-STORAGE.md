# Private certificate storage

Certificate files (names, marks, IDs) live in the Supabase Storage bucket `certificates`. The bucket used
to be public, so anyone holding an object URL could read the file. It is now private and files are served
only through short-lived signed URLs that the server creates after an authorization check.

## How it works

| Step | What happens |
|---|---|
| Upload | The student uploads through `POST /api/certificates/ocr-gemini`. The server stores the object at `<userId>/<file>` using the student's own session, so the owner-folder storage policy applies. The route still returns a `publicUrl` string in the canonical object-URL form; it is only an identifier now and does not work in a browser. |
| Preview after upload | The upload page previews the selected file from a local browser object URL. It never opens the storage URL. |
| Save | `POST /api/certificates/create` validates the canonical URL shape (own folder only), stores `file_url` and `storage_path` (`<userId>/<file>`). |
| View | The UI calls `GET /api/certificates/[id]/file` when the user clicks "view". The response is `{ data: { url, expiresIn } }` with `expiresIn = 300` seconds and `Cache-Control: no-store`. The URL is created with the service-role client; nothing is cached or stored. |
| Delete | `DELETE /api/certificates/delete` removes the object with the service-role client (unchanged). |

### Who may open a file

- the student who owns the certificate,
- an approved faculty, admin or org_admin of the certificate's organization,
- an approved super admin.

Recruiters never receive certificate files (see `src/lib/privacy/studentView.ts`). Every other case (unknown id,
another organization, another student, a recruiter, a missing object, a malformed id) gets the same
`404 File not found`, so the route does not reveal whether a certificate exists. The route is rate limited per user.

### Object path

`storage_path` is used when it has the form `<ownerId>/<file>`. Older rows without it fall back to parsing
`file_url`. In both cases the first segment must equal the certificate owner's id; anything else (other
folder, traversal, extra segments) is refused.

### Storage policies

The migration `supabase/migrations/20261016_01_private_certificates_bucket.sql` leaves exactly four policies
on `storage.objects` for this bucket: an authenticated user may insert, read, update and delete only objects whose
first path segment is their own user id. There is no anon access. Reviewers have no storage policy; they
always go through the server route.

## Deploy order

1. **Deploy the code** (the new route, the UI that uses it, the upload page). While the bucket is still public
   everything keeps working, because the UI already uses signed URLs (signing also works for public buckets).
2. **Run the migration** `20261016_01_private_certificates_bucket.sql` in the SQL editor. Do not run it
   before step 1: old links stop working the moment the bucket flips.
3. **Test** with real accounts:
   - a student uploads a certificate, sees the extracted fields and the "View original file" preview, and saves it;
   - the student opens the file from the dashboard (the file opens in a new tab);
   - a faculty member of the same organization opens the file from the review pages;
   - a faculty member of another organization, or another student, gets "File unavailable";
   - an old public URL (`.../storage/v1/object/public/certificates/...`) now returns an error;
   - the verification queries at the bottom of the migration show `public = false` and only the four owner policies.

## Rollback

If something breaks after step 2 and you need the old behavior quickly:

```sql
update storage.buckets set public = true where id = 'certificates';
```

The application keeps working (signed URLs are valid for public buckets as well) and old links work again.
This restores the exposure, so treat it as temporary and investigate the cause. The owner-folder policies can stay.

## Known leftovers

- `certificates.file_url` is still stored and still returned by some API payloads (`/api/certificates/mine`,
  `/api/certificates/pending`, `/api/student/dashboard`) because other code uses it as an identifier. After the bucket flip
  it is a dead link and the UI never uses it as an `href` or `src` (a test enforces this).
- Signed URLs are bearer links for up to five minutes; anyone who receives one in that window can open the file.
