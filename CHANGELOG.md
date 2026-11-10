# Changelog

## 2.0.0

### Breaking changes

- `save` is now an HTTP client for the Download Me backend. Inspection, media
  download, audio conversion and verification run remotely; no local media engine
  or automatic local fallback is used.
- The automatic development connection is `http://localhost:8080/api/v1`.
  A running compatible Download Me API and worker on that device are required.
  A publicly hosted default has not been configured yet.
- Supported media currently means single public YouTube videos. The former
  local engine's other platforms, playlists, cookies, proxy, subtitles, aria2,
  connection-count and timing options are not supported.
- Requested video resolution must exist exactly; unavailable qualities fail
  instead of silently downloading a lower quality.

### Added

- Session/CSRF-aware inspection, job polling, cancellation and streamed file saving.
- Atomic no-clobber file saving, temporary transfer cleanup and Unicode filenames.
- Short options for quality, audio, format, picker, listing, batch, overwrite,
  backend override and opt-in usage reporting.
- CLI source attribution for backend-verified completion statistics.
- Optional visit reporting, off by default, with disclosed IP/client metadata.
- Standalone packaging with an embedded runtime and no bundled media tools.
- User-facing installation and usage documentation, npm installation instructions,
  and backend-client regression tests.

### Installation

- npm: `npm install -g @opiobonniky/save@latest` (requires Node.js 18+).
- Standalone ZIP or platform installer: no installed Node.js required.
- Pick one installation method to avoid multiple `save` executables on PATH.
