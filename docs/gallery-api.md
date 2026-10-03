# Gallery API (home server)

The booth's QR codes point at the photobooth gallery on homeserver. Manage
photos and keys in its admin panel at http://homeserver:8000/admin (tailnet
only). This file covers how the booth uses the gallery, then reproduces
the gallery's API reference.

The source of truth is `~/photobooth/API.md` on homeserver. Update the
copy below when that changes.

## How the booth uses it

```
Scan: badge tap (or Skip Scan)  → PhotoboothApp keeps galleryBadge(tap) for the session
Review: guest taps Print, answers "Share it with Everyone?"
  └─ PhotoboothApp.print(mode, shots, visibility)
       ├─ printer.print(...)                      → /api/print (Selphy)
       └─ createStripShareQr(jpeg, origin, visibility, badge)   lib/stripShare.ts
            └─ POST /api/share { image, visibility, badge }      app/api/share/route.ts
                 1. gallery: POST {GALLERY_UPLOAD_URL}/api/photos    lib/galleryClient.ts
                 2. else Vercel Blob (BLOB_READ_WRITE_TOKEN)
                 3. else this machine's disk (/api/share/file/<name>)
  then, after the print is sent, gallery uploads only:
       shareFrames(photoId, strip, shots)                         lib/stripShare.ts
            └─ POST /api/share/frames { photoId, strip, frames }  app/api/share/frames/route.ts
                 └─ POST {GALLERY_UPLOAD_URL}/api/photos/{id}/frames   lib/galleryClient.ts
```

### `POST /api/share` (booth, same origin)

Request JSON:

| Field | Notes |
|---|---|
| `image` | `data:image/jpeg;base64,…`: the upright print (landscape for the grid) |
| `visibility` | `public` or `private` (default). Only the gallery uses it. |
| `badge` | the guest's badge tap in the gallery's `badge` format, or `null` if they skipped the scan. Only the gallery stores it. |

`galleryBadge()` in `lib/nfcChallenge.ts` maps the badge station's tap
(`tagUid`, `portalUserId`, `user.firstName/lastName/displayId`, `status`,
`at`, `pointsAwarded`) to the gallery fields. The badge is cleared when the
session resets, so every photo from that guest (retakes included) gets their
tap and the next guest starts clean. Badge data appears only in the gallery's
admin panel, never on the guest's page.

Response JSON:

| Field | Notes |
|---|---|
| `url` | where the copy was stored |
| `page` | set only for gallery uploads: the gallery's `/p/<id>` page, which the QR encodes as-is |
| `photoId` | set only for gallery uploads: the gallery photo id, for `/api/share/frames` |
| `local` | `true` when it fell back to this machine's disk |

Without `page`, the QR encodes the booth's own `/view?u=<url>` page. If the
gallery upload fails, the booth logs `Gallery upload failed, falling back` and
moves to the next option, so the guest still gets a QR. The gallery upload
gives up after 15 s.

### `POST /api/share/frames` (booth, same origin)

The second request, sent once the print is away so it never holds up the
QR code on the print. It attaches the guest's shots to their gallery photo,
whose page then offers "Download all (zip)" and a thumbnail per shot. Blob and
disk copies stay strip-only.

| Field | Notes |
|---|---|
| `photoId` | from `/api/share` |
| `strip` | `data:image/jpeg;base64,…`: one strip (strip mode: the left half of the sheet, which prints two identical strips; grid mode: the whole sheet) |
| `frames` | 1–4 `data:image/jpeg;base64,…` URLs: the shots at the camera's resolution, in order |

`204` on success. `400` for bad input, `409` without a gallery configured,
`502` if the gallery refuses (it only takes frames from the key that made the
photo, within 10 minutes, once). The booth only logs a failure; the guest
still has the strip. The frames upload gives up after 60 s.

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
| `http://homeserver:8000` | the tailnet only | admin calls with the admin key, and the [admin panel](#admin-panel-admin) |

Requests that come in through Funnel carry a `Tailscale-Funnel-Request`
header, added by tailscaled. The app uses it to tell the two routes apart; a
client can't remove it.

### Auth

Writes take `Authorization: Bearer <key>`. Reads need no auth.

| Key | Looks like | Where it's accepted | Can call |
|---|---|---|---|
| Admin key | `API_KEY` in `.env` | tailnet only (403 through Funnel) | every write |
| Upload key | `pbu_…` | Funnel and tailnet | `POST /api/photos`, and `POST /api/photos/{id}/frames` for its own photos |

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
| 400 | `invalid_badge` | `badge` isn't a JSON object of the right types, or is over 4 KB |
| 401 | `unauthorized` | missing, wrong, expired or revoked key, or an upload key on an admin-only write over the tailnet |
| 403 | `forbidden` | any admin-only write (`PATCH`, `DELETE`, or an upload with the admin key) through Funnel, whatever the key |
| 404 | `not_found` | unknown or expired photo, bad media name |
| 409 | `frames_exist` | the photo already has its frames |
| 409 | `frames_closed` | an upload key adding frames over 10 minutes after the upload |
| 405 | `method_not_allowed` | wrong method |
| 413 | `too_large` | upload over 15 MB (for frames: the strip and frames together) |
| 422 | `invalid_visibility` | visibility isn't `public` or `private` |
| 429 | `rate_limited` | over 300 requests/min or 20 uploads/min per IP (frames count as uploads), or 30 photo-ID 404s/min |
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
  "download_url": "https://gallery.example.ts.net:8443/media/k3Jx9aQw2LmP/original.jpg",
  "frames": [
    {
      "url": "https://gallery.example.ts.net:8443/media/k3Jx9aQw2LmP/frames/1.jpg",
      "thumb_url": "https://gallery.example.ts.net:8443/media/k3Jx9aQw2LmP/frames/1-thumb.jpg"
    }
  ],
  "zip_url": "https://gallery.example.ts.net:8443/media/k3Jx9aQw2LmP/photos.zip"
}
```

- `id`: 12 random URL-safe characters (~72 bits), so it can't be guessed.
- `visibility`: `public` is listed on the gallery; `private` is reachable
  only by link.
- `expires_at`: `created_at` + `RETENTION_DAYS` (30), or `null` to keep
  forever. Expired photos 404 at once, and an hourly job deletes the files.
- The URLs always use the public base URL (`PUBLIC_BASE_URL`), even when the
  upload came over the tailnet. Put `url` in the QR code.
- `frames`: the individual shots, in order, once the booth has added them
  (`[]` until then, and for older photos). `zip_url` is `null` until then.

### Endpoints

#### `POST /api/photos`: upload (admin or upload key)

`multipart/form-data`:

| Field | Required | Notes |
|---|---|---|
| `file` | yes | JPEG or PNG, up to 15 MB and 60 MP |
| `visibility` | no | `public` or `private` (default) |
| `badge` | no | JSON object: the guest's NFC badge tap (below) |

`badge` fields, all optional; unknown keys are ignored:

| Key | Type | Stored as |
|---|---|---|
| `tag_uid` | string (≤64) | `badge_uid` |
| `user_id` | integer | `badge_user_id`, the portal user id |
| `display_id` | string (≤64) | `badge_display_id` |
| `name` | string (≤128) | `badge_name` |
| `status` | string (≤32) | `badge_status`, e.g. `checked_in`, `already_checked_in` |
| `tapped_at` | unix seconds or ISO 8601 | `badge_tapped_at` (unix seconds) |
| `points` | integer | `badge_points` |

Badge data is **never** in public responses (the photo object and `/p/` pages).
Only the admin panel shows it.

The server checks that the file is a real image, applies the EXIF rotation,
then re-encodes it. This drops all metadata, including GPS. It stores
`original.jpg` (quality 92), `web.jpg` (1600 px wide) and `thumb.jpg`
(400 px), and records which upload key made the photo.

`201` returns a photo object.

```bash
curl -H "Authorization: Bearer $KEY" -F file=@print.jpg -F visibility=private \
  https://gallery.example.ts.net:8443/api/photos
```

#### `POST /api/photos/{id}/frames`: add the shots (admin or the photo's upload key)

The booth's second request, sent after the upload so the print's QR code
isn't held up. `multipart/form-data`:

| Field | Required | Notes |
|---|---|---|
| `strip` | yes | JPEG or PNG: the single strip for the zip (strip mode: one half of the sheet; grid mode: the whole sheet) |
| `frames` | yes, 1–4 | JPEG or PNG, repeated once per shot, in order |

Together they can be up to 15 MB. An upload key may only add frames to a
photo it uploaded, within 10 minutes of the upload (`401` for another key's
photo, `409 frames_closed` after that). Frames can be added once
(`409 frames_exist`). Each image is checked and re-encoded like an upload,
and the server stores `frames/strip.jpg`, `frames/<n>.jpg` (quality 92) and
`frames/<n>-thumb.jpg` (400 px). `201` returns the photo object.

```bash
curl -H "Authorization: Bearer $KEY" -F strip=@strip.jpg   -F frames=@1.jpg -F frames=@2.jpg -F frames=@3.jpg -F frames=@4.jpg   https://gallery.example.ts.net:8443/api/photos/k3Jx9aQw2LmP/frames
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

Removes the row and the files, frames included. `204`.

#### `GET /healthz`

`200 {"status":"ok"}`. Not rate limited.

### Pages and media

| Path | What |
|---|---|
| `GET /` | Public gallery grid |
| `GET /p/{id}` | Photo page with Download and Share, plus the expiry date; with frames, also Download all (zip) and a thumbnail per shot |
| `GET /media/{id}/web.jpg`, `thumb.jpg` | Images, cached for a year |
| `GET /media/{id}/original.jpg` | Full-size download (`Content-Disposition: attachment`) |
| `GET /media/{id}/frames/{n}.jpg`, `{n}-thumb.jpg` | One shot and its thumbnail, shown inline (long-press to save on iPhone) |
| `GET /media/{id}/photos.zip` | The strip (`photobooth-strip.jpg`) and each shot (`photo-<n>.jpg`), uncompressed; `404` without frames |
| `GET /robots.txt` | Disallows `/p/`, `/media/` and `/api/` |
| `GET /admin` | Admin panel, tailnet only (see below) |

`/p/` and `/media/` send `X-Robots-Tag: noindex, nofollow`. Every response
sets a strict CSP, `X-Frame-Options: DENY`, `nosniff` and `no-referrer`.
The docs/OpenAPI endpoints are turned off.

### Admin panel (`/admin`)

`http://homeserver:8000/admin` lists every photo, public and private, with
its badge tap. From there you can make photos public or private, delete them
one at a time or in bulk, search by name, display ID, badge UID or photo ID,
and create or revoke upload keys.

**Login is being on the tailnet.** A request is let in when all of these hold:

- it didn't come through Funnel (no `Tailscale-Funnel-Request` header);
- its client IP is a Tailscale address (`100.64.0.0/10` or
  `fd7a:115c:a1e0::/48`), taken from the last `X-Forwarded-For` entry that
  `tailscale serve` appends;
- the `Host` is a MagicDNS short name, a `*.ts.net` name or a Tailscale IP,
  which blocks DNS rebinding.

Anything else gets `404`, so the panel doesn't exist from the internet. The
page shows the `Tailscale-User-Login` that `tailscale serve` adds. Anyone on
your tailnet can use it, so check your Tailscale access rules if you share
the tailnet.

#### Admin JSON API

Same tailnet check, plus the request must send `X-Admin-Request: 1` (`403`
otherwise), and `Origin`, if present, must match `Host`. The custom header
forces a CORS preflight that the app never approves. That stops another
website from driving these endpoints through an admin's browser.

| Method & path | Body | Returns |
|---|---|---|
| `GET /admin/api/photos` | query: `limit` (≤200, default 48), `before`, `before_id`, `visibility`, `key` (key id or `admin`), `q` | `{items, next_before, next_before_id}`; items are photo objects plus `width`, `height`, `bytes_original`, `key_id`, `key_label`, `badge` |
| `PATCH /admin/api/photos/{id}` | `{"visibility": "public"}` | `{id, visibility}` |
| `POST /admin/api/photos/visibility` | `{"ids": [...], "visibility": "private"}` (≤500 ids) | `{changed}` |
| `POST /admin/api/photos/delete` | `{"ids": [...]}` (≤500 ids) | `{deleted}` |
| `GET /admin/api/keys` | | `{items: [{id, label, state, created_at, expires_at, uploads}]}` |
| `POST /admin/api/keys` | `{"label": "booth-1", "days": 3}` (0–30 days) | `201 {id, label, expires_at, key}`; the key is shown only here |
| `POST /admin/api/keys/{id}/revoke` | | `{id, state}` |
| `GET /admin/api/stats` | | counts (`total`, `public`, `private`, `with_badge`), `bytes_original`, `disk_free`, `disk_total`, `who` |

### Settings (`.env`)

| Variable | Default | |
|---|---|---|
| `API_KEY` | required | admin key |
| `PUBLIC_BASE_URL` | required | base for the URLs in photo objects |
| `RETENTION_DAYS` | 30 | photo lifetime, `0` = forever |
| `UPLOAD_KEY_DAYS` | 3 | lifetime of new upload keys |
| `UPLOAD_KEY_DAILY_LIMIT` | 500 | uploads per upload key per UTC day |
| `MIN_FREE_GB` | 20 | refuse uploads below this much free space |
