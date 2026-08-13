---
name: github-release
description: >-
  Publish beggar_chis (Chis Flasher) GitHub Releases. Use when the user asks to
  release, publish, tag, ship, 发版, Release, or push a version. Tag push must
  create a published Release (not draft). Owner eyenobig, branch master, tags v*.
---

# beggar_chis GitHub Release

## Rules

- Repo: `eyenobig/beggar_chis`；发版分支固定 **`master`**
- **只有推送 `v*` tag 才触发** `.github/workflows/release.yml`（普通 push 只跑 CI）
- `releaseDraft` 必须为 **`false`** → 直接公开 Release，禁止草稿
- 以 **eyenobig** 名义操作；兼容锚定见 `package.json` → `compatibility.cmd`（当前 cfb `0.3.5`）
- 未明确要求时不要 `git push`；用户要求发版时再推 tag

## 发版步骤

1. 确认改动已在 `master`，版本已 bump：
   - `package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` 版本一致
2. 提交（conventional commits，如 `chore: bump version to X.Y.Z`）
3. 打 tag 并推送（触发 Release）：

```bash
git checkout master
git pull origin master
git tag vX.Y.Z
git push origin master
git push origin vX.Y.Z
```

4. 打开 Actions → **Release** workflow，确认 `gate` + `publish-tauri` 成功
5. 打开 https://github.com/eyenobig/beggar_chis/releases/tag/vX.Y.Z  
   应直接是 **Published**（不是 Draft），含 NSIS 安装包与 updater json/sig

## 门禁失败时

Tag 必须是 `master` 的祖先提交。否则 gate 报错：把 `master` 快进到该提交，或在 `master` 上重打 tag。

## 手动触发

Actions → Release → **Run workflow**（`workflow_dispatch`）。仍发布正式 Release，不是草稿。

## 草稿清理

若历史上留下 Draft：登录后 Releases → Drafts → Delete；或：

```bash
gh release list --repo eyenobig/beggar_chis
gh api repos/eyenobig/beggar_chis/releases --jq '.[] | select(.draft==true) | {id,tag:.tag_name}'
gh api -X DELETE repos/eyenobig/beggar_chis/releases/ID
```

不要删除用户仍在用的已公开正式 Release。

## 工作流要点（勿改回）

`.github/workflows/release.yml` 中 tauri-action：

- `releaseDraft: false`
- `prerelease: false`
- `releaseName: Chis Flasher / 烧丐 ${{ github.ref_name }}`
- `includeUpdaterJson: true` / `updaterJsonPreferNsis: true`
