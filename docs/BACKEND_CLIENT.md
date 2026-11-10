# Backend-only CLI

The `save` entrypoint no longer executes or installs yt-dlp, ffmpeg, Deno, aria2c
or Python. The backend owns inspection, exact-format selection validation,
downloading, merging/conversion, verification and completion tracking. The client
only displays formats/progress and streams the ready file to disk.

The interactive picker and `--list-formats` collapse raw duplicates using the
same compatibility ranking as the web: one actual ID per resolution, H.264/MP4
preferred, then one audio source. `--format` still accepts any advertised real ID.
The picker offers original audio and an MP3 action for that same source. Size
estimates are source sizes, not promises about merged or converted output size.
TTY progress distinguishes indeterminate inspection/startup, backend preparation
percentages and the separate file-transfer phase. Non-TTY logs have no ANSI codes.

## Configure and use

```sh
save config set backendUrl https://your-api.example/api/v1
save "https://youtu.be/VIDEO_ID" --quality 1080p
save "https://youtu.be/VIDEO_ID" --audio
save "https://youtu.be/VIDEO_ID" --list-formats
save "https://youtu.be/VIDEO_ID" --format 137
save --batch urls.txt ~/Videos --quality 720p
save doctor
```

Backend URL priority: `--backend`, `SAVE_BACKEND_URL`, saved `backendUrl`, then
`http://localhost:8080/api/v1`. Remote servers require HTTPS. Configure a real
deployment URL before distributing a client to other devices; localhost only
works when the backend is on that device. Never embed worker tokens in the client.

The client bootstraps an anonymous session and CSRF token, retaining cookies for
the command's lifetime. CLI jobs carry `source: CLI`; only backend-verified ready
files increment CLI completion totals. The source label is client-reported,
not authenticated installation identity. Optional `--report-usage` records a
CLI visit; the download request itself necessarily exposes a request IP/agent to
the server. No separate visit report is sent without opt-in.

Ctrl+C during preparation requests backend cancellation. Polling is bounded to
15 minutes. Transfers stream to a private random `.part` file; incomplete files
are cleaned up. Destination files are never overwritten unless `--overwrite` is
set. The filename comes from the backend attachment header and is stripped of
directory components/unsafe characters.

## No Node installation for users

Build on the release platform with `npm ci && npm run build:standalone`. Build
tools need Node/npm, but the resulting archive contains a client executable with
its runtime embedded. End users need neither Node nor media tools installed.
Extract it and run `./save`, or use `./install.sh` on Linux/macOS. Windows users
run `save.exe`. npm/source installs still require Node; use the standalone archive
for Node-free installation. A backend must be reachable for all downloads.

## Compatibility changes

- Only single YouTube videos are currently supported by the backend. The old
  CLI's TikTok/Facebook/Instagram/playlist support is not provided by this server.
- Batch input is sequential single-video API requests, not a server playlist job.
- Quality is exact: unavailable requested heights fail rather than downgrade.
- Local `--proxy`, cookies-from-browser, custom media User-Agent, subtitles,
  connections, aria2 and playlist flags are removed; they must be implemented as
  explicit backend features before the client can offer them.
- Server resource/file-size/duration restrictions still apply.
- Old local-engine source modules remain for reference and existing unit tests,
  but the CLI entrypoint and standalone bundle do not import them.

Apply backend Flyway migrations on restart before using the new client. V4 adds
job source attribution; V3 adds page-view request metadata.
