# Update architecture

## Application updater

The desktop application uses the official Tauri v2 updater. Application updates contain the Vue frontend, Rust shell, and packaged fallback CFB sidecar as one signed unit.

- Endpoint: `https://github.com/eyenobig/beggar_chis/releases/latest/download/latest.json`
- Release artifacts: generated with `bundle.createUpdaterArtifacts = true`
- Signature: minisign public key is embedded in `tauri.conf.json`
- Installation: passive on Windows, followed by an application relaunch
- Safety gate: download/install is blocked while a cartridge operation is running
- Scheduling: production builds check ten seconds after startup and every six hours; Settings also provides a manual check

The private key is local-only at `.tauri/chis-flasher.key` and is ignored by Git. Back it up securely. Configure these GitHub Actions repository secrets before publishing:

- `TAURI_SIGNING_PRIVATE_KEY`: full private-key file content
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: empty for the currently generated key

The release workflow fails early with a clear error when the private key secret is missing. The Tauri action uploads signed updater artifacts and `latest.json`.

## CFB updater

CFB updates are independent of application updates. The GitHub Releases API acts as the version manifest and supplies the official SHA-256 digest for each platform asset.

On a production startup:

1. Read `app_data/toolchain/cmd/current.json`.
2. Reuse the current binary for six hours when its SHA-256 still matches.
3. Query the latest CFB release (`CFB_GITHUB_REPO`, default `eyenobig/chis-burner-cmd`).
4. Select the exact current-platform asset and require its GitHub SHA-256 digest.
5. Restrict downloads to the official repository Release URL and a 32 MiB maximum.
6. Download to a staging filename inside a versioned directory.
7. Verify size and SHA-256.
8. Execute `cfb version --json` and require it to match the release tag.
9. Rename the staged binary and atomically switch `current.json`.
10. Preserve the old pointer as `previous.json`.

If GitHub is unavailable or a candidate fails validation, the last verified binary remains active. The packaged sidecar remains the final offline fallback.

## Rule/profile data

CFB v0.3.4 embeds all current profiles, so the application does not fetch an unsigned rule archive. A future independent rule updater should only be enabled after the rule repository publishes versioned release assets with SHA-256 digests (or signatures) and a schema compatibility field. Remote Vue/JavaScript code is intentionally not hot-swapped.

Frontend stub: `src/services/toolchain/components/rule.js` (`resolveRuleRelease` throws until assets exist). Shared acquisition layout: `.agents/skills/toolchain-assets/SKILL.md`.

## Shared toolchain acquisition

SkyEmu / cfb / rule share `src/services/toolchain/` for release resolve + download helpers. Execution stays separate (DirectPlay / spawn / profiles). Packaged CFB still uses the Rust ensure path above for digest verification.

## Release checklist

1. Increase the application version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Build and test all four platform targets.
3. Push the version commit to `main`.
4. Create and push the matching `vX.Y.Z` tag.
5. Confirm the GitHub Release contains installers, updater signatures, and `latest.json`.
6. Install the previous version and verify check, download, install, and relaunch against the new release.
