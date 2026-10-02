# Gallery API (home server)

The booth's QR codes point at the photobooth gallery on homeserver. This
file covers how the booth uses it, then reproduces the gallery's API
reference.

The source of truth is `~/photobooth/API.md` on homeserver. Update the
copy below when that changes.

## How the booth uses it

```
Review: guest taps Print, answers "Share it with Everyone?"
  └─ PhotoboothApp.print(mode, shots, visibility)
       ├─ printer.print(...)                      → /api/print (Selphy)
       └─ createStripShareQr(jpeg, origin, visibility)    lib/stripShare.ts
            └─ POST /api/share { image, visibility }      app/api/share/route.ts
                 1. gallery: POST {GALLERY_UPLOAD_URL}/api/photos    lib/galleryClient.ts
                 2. else Vercel Blob (BLOB_READ_WRITE_TOKEN)
                 3. else this machine's disk (/api/share/file/<name>)
```

### `POST /api/share` (booth, same origin)

Request JSON:

| Field | Notes |
|---|---|
| `image` | `data:image/jpeg;base64,…`: the upright print (landscape for the grid) |
| `visibility` | `public` or `private` (default). Only the gallery uses it. |

Response JSON:

| Field | Notes |
|---|---|
| `url` | where the copy was stored |
| `page` | set only for gallery uploads: the gallery's `/p/<id>` page, which the QR encodes as-is |
| `local` | `true` when it fell back to this machine's disk |

Without `page`, the QR encodes the booth's own `/view?u=<url>` page. If the
gallery upload fails, the booth logs `Gallery upload failed, falling back` and
moves to the next option, so the guest still gets a QR. The gallery upload
gives up after 15 s.

### Booth settings (`.env.local`)

```
GALLERY_UPLOAD_URL=https://gallery.example.ts.net:8443
GALLERY_API_KEY=pbu_…    # upload-only key, lasts 3 days
```

Make a key per booth on homeserver with
`~/photobooth/scripts/upload-key.sh create <booth-name>`, and replace it
before it expires (`upload-key.sh list` shows expiry). An expired key returns
`401`, and the booth falls back until it's replaced. If a booth or key goes
missing, revoke it with `upload-key.sh revoke <id>`.

---

## Gallery API reference (copy of `~/photobooth/API.md`)

The HTTP API of the photobooth gallery on homeserver (`~/photobooth`).
On the server, PLAN.md is the original design and README.md covers running it.

### Base URLs

| URL | Reachable from | Use |
|---|---|---|
| `https://gallery.example.ts.net:8443` | the internet (Tailscale Funnel) | guests, and booth uploads with an upload key |
| `http://homeserver:8000` | the tailnet only | admin calls with the admin key |

Requests that come in through Funnel carry a `Tailscale-Funnel-Request`
header, added by tailscaled. The app uses it to tell the two routes apart; a
client can't remove it.

### Auth

Writes take `Authorization: Bearer <key>`. Reads need no auth.

| Key | Looks like | Where it's accepted | Can call |
|---|---|---|---|
| Admin key | `API_KEY` in `.env` | tailnet only (403 through Funnel) | every write |
| Upload key | `pbu_…` | Funnel and tailnet | `POST /api/photos` only |

Upload keys are made on the server and last `UPLOAD_KEY_DAYS` (3 by default):

```bash
scripts/upload-key.sh create booth-1 [--days N]   # prints id, expiry and the key, once
scripts/upload-key.sh list                         # id, live/expired/revoked, expiry, uploads, label
scripts/upload-key.sh revoke <id>                  # stops the key working now
```

Only a SHA-256 of each upload key is stored. An expired, revoked or unknown
key gets `401`.

### Errors

Every API error has this shape:

```json
{ "error": { "code": "invalid_image", "message": "File is not a valid image" } }
```

| Status | Code | When |
|---|---|---|
| 400 | `invalid_image` | not a real JPEG or PNG |
| 400 | `invalid_request` | missing or malformed field |
| 401 | `unauthorized` | missing, wrong, expired or revoked key, or an upload key on an admin-only write over the tailnet |
| 403 | `forbidden` | any admin-only write (`PATCH`, `DELETE`, or an upload with the admin key) through Funnel, whatever the key |
| 404 | `not_found` | unknown or expired photo, bad media name |
| 405 | `method_not_allowed` | wrong method |
| 413 | `too_large` | upload over 15 MB |
| 422 | `invalid_visibility` | visibility isn't `public` or `private` |
| 429 | `rate_limited` | over 300 requests/min or 20 uploads/min per IP, or 30 photo-ID 404s/min |
| 429 | `quota_exceeded` | upload key over `UPLOAD_KEY_DAILY_LIMIT` (500) uploads this UTC day |
| 507 | `storage_full` | the photo drive has under `MIN_FREE_GB` (20) free |

Page routes (`/`, `/p/…`) show the same errors as an HTML page.

### Photo object

Returned by upload, get and patch. Times are unix seconds.

```json
{
  "id": "k3Jx9aQw2LmP",
  "visibility": "private",
  "created_at": 1790000000,
  "expires_at": 1792592000,
  "url": "https://gallery.example.ts.net:8443/p/k3Jx9aQw2LmP",
  "image_url": "https://gallery.example.ts.net:8443/media/k3Jx9aQw2LmP/web.jpg",
  "thumb_url": "https://gallery.example.ts.net:8443/media/k3Jx9aQw2LmP/thumb.jpg",
  "download_url": "https://gallery.example.ts.net:8443/media/k3Jx9aQw2LmP/original.jpg"
}
```

- `id`: 12 random URL-safe characters (~72 bits), so it can't be guessed.
- `visibility`: `public` is listed on the gallery; `private` is reachable
  only by link.
- `expires_at`: `created_at` + `RETENTION_DAYS` (30), or `null` to keep
  forever. Expired photos 404 at once, and an hourly job deletes the files.
- The URLs always use the public base URL (`PUBLIC_BASE_URL`), even when the
  upload came over the tailnet. Put `url` in the QR code.

### Endpoints

#### `POST /api/photos`: upload (admin or upload key)

`multipart/form-data`:

| Field | Required | Notes |
|---|---|---|
| `file` | yes | JPEG or PNG, up to 15 MB and 60 MP |
| `visibility` | no | `public` or `private` (default) |

The server checks that the file is a real image, applies the EXIF rotation,
then re-encodes it. This drops all metadata, including GPS. It stores
`original.jpg` (quality 92), `web.jpg` (1600 px wide) and `thumb.jpg`
(400 px), and records which upload key made the photo.

`201` returns a photo object.

```bash
curl -H "Authorization: Bearer $KEY" -F file=@print.jpg -F visibility=private \
  https://gallery.example.ts.net:8443/api/photos
```

#### `GET /api/photos`: list public photos

Query: `limit` (1–100, default 24), `before` and `before_id` (the cursor
from the previous page). Newest first, public photos only.

```json
{
  "items": [{ "id": "…", "thumb_url": "…", "url": "…", "created_at": 1790000000 }],
  "next_before": 1789990000,
  "next_before_id": "…"
}
```

To get the next page, pass both `next_before` and `next_before_id` back as
`before` and `before_id`. Both are `null` on the last page.

#### `GET /api/photos/{id}`: one photo

Works for public and private photos, because the ID is the secret. `200`
returns a photo object, or `404`.

#### `PATCH /api/photos/{id}`: change visibility (admin key)

JSON body `{ "visibility": "public" }`. `200` returns the updated photo
object.

#### `DELETE /api/photos/{id}`: delete (admin key)

Removes the row and the files. `204`.

#### `GET /healthz`

`200 {"status":"ok"}`. Not rate limited.

### Pages and media

| Path | What |
|---|---|
| `GET /` | Public gallery grid |
| `GET /p/{id}` | Photo page with Download and Share, plus the expiry date |
| `GET /media/{id}/web.jpg`, `thumb.jpg` | Images, cached for a year |
| `GET /media/{id}/original.jpg` | Full-size download (`Content-Disposition: attachment`) |
| `GET /robots.txt` | Disallows `/p/`, `/media/` and `/api/` |

`/p/` and `/media/` send `X-Robots-Tag: noindex, nofollow`. Every response
sets a strict CSP, `X-Frame-Options: DENY`, `nosniff` and `no-referrer`.
The docs/OpenAPI endpoints are turned off.

### Settings (`.env`)

| Variable | Default | |
|---|---|---|
| `API_KEY` | required | admin key |
| `PUBLIC_BASE_URL` | required | base for the URLs in photo objects |
| `RETENTION_DAYS` | 30 | photo lifetime, `0` = forever |
| `UPLOAD_KEY_DAYS` | 3 | lifetime of new upload keys |
| `UPLOAD_KEY_DAILY_LIMIT` | 500 | uploads per upload key per UTC day |
| `MIN_FREE_GB` | 20 | refuse uploads below this much free space |
