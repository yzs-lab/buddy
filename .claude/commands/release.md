---
description: 发布新版本（生成 changelog、创建 Release、构建部署）
argument-hint: <version>  e.g. v1.2.0
allowed-tools: Bash(git *), Bash(glab *), Bash(pnpm *), Bash(node *), Bash(find *), Bash(rsync *), Bash(chmod *), Bash(hdiutil *), Bash(scripts/release.sh*), Bash(sh scripts/*), Read, Edit
---

## Context

- Current version: !`node -e "console.log(require('./package.json').version)"`
- Latest tag: !`git describe --tags --abbrev=0 2>/dev/null || echo "none"`
- Commits since last tag: !`git log --oneline $(git describe --tags --abbrev=0 2>/dev/null)..HEAD 2>/dev/null || git log --oneline -20`
- User argument: $ARGUMENTS
- Release remote: !`git remote get-url upstream 2>/dev/null && echo "upstream" || echo "origin"`
- glab targets: !`glab repo view 2>/dev/null | head -1`

## Your task

Execute the full release process for version `$ARGUMENTS`. Follow these steps in order:

### Step 1: Detect release remote

- Determine which remote to use for pushing commits, tags, and releases:
  - If `upstream` remote exists, use `upstream`
  - Otherwise use `origin`
- Verify the chosen remote matches the project that `glab` targets (check `glab repo view`)
- If they don't match, warn the user and ask whether to proceed — mismatches cause releases and assets to land on different projects
- Store the chosen remote as `PUSH_REMOTE` for use in later steps

### Step 2: Validate version

- Extract version from `$ARGUMENTS` (e.g. `v1.2.0` → version is `1.2.0`)
- Validate it matches format `vX.Y.Z` where X, Y, Z are non-negative integers
- Ensure this version is greater than the current version in `package.json`
- If validation fails, tell the user and stop

### Step 3: Check for existing tag and release

- Run `git tag --list "$ARGUMENTS"` to check if the tag already exists
- Run `glab release view "$ARGUMENTS" 2>/dev/null` to check if the GitLab Release already exists
- If the tag already exists, this is a **re-run** scenario. Tell the user clearly that tag/release already exists and ask:
  - If they want to continue with build + deploy only (skip version bump, commit, tag, push, and Release creation)
  - Or if they want to abort
- If continuing a re-run, skip directly to Step 7

### Step 4: Generate changelog

- Read all commits since the last tag (or all commits if no tag exists)
- Categorize by conventional commit type:
  - `feat:` → 新功能
  - `fix:` → 修复
  - `refactor:` → 重构
  - `perf:` → 性能优化
  - `docs:` → 文档
  - `ci:` / `chore:` → 工程化
  - Others → 其他
- Generate a Chinese changelog in markdown format, e.g.:

```markdown
## 新功能
- 支持双架构自动更新 (feat: updater)

## 修复
- 修复倒计时暂停后无法恢复的问题 (fix: countdown)

## 工程化
- 精简 CI 配置 (ci: remove macos jobs)
```

- If there are no commits since last tag, warn the user and ask whether to proceed

### Step 5: Update CHANGELOG.md

- Prepend the generated changelog entry to `CHANGELOG.md`, following the existing format:
  - `## [X.Y.Z] - YYYY-MM-DD` as the version header
  - Sections: `### Added`, `### Changed`, `### Fixed`, `### Removed`
  - Add a link reference at the bottom: `[X.Y.Z]: https://gitlab.weibo.cn/ailab/buddy-macos/-/tags/$ARGUMENTS`
- The new entry goes ABOVE the previous entries, below the `# Changelog` header

### Step 6: Bump version and commit

- Update `version` field in `package.json` to the new version (without `v` prefix)
- `git add package.json CHANGELOG.md`
- `git commit -m "chore: release $ARGUMENTS"`

### Step 7: Create tag and push

- `git tag $ARGUMENTS`
- `git push $PUSH_REMOTE main $ARGUMENTS`
- If `$PUSH_REMOTE` is `upstream` AND `origin` also exists, also push to origin: `git push origin main $ARGUMENTS`

### Step 8: Create GitLab Release

- Use `glab release create` with the generated changelog as notes:
```bash
glab release create "$ARGUMENTS" --name "Buddy $ARGUMENTS" --notes "<changelog>"
```
- If the changelog is multi-line, write it to a temp file first and use `--notes-file`

### Step 9: Run release script

- Execute `scripts/release.sh $ARGUMENTS`
- This handles: build → verify → upload to Package Registry → update Release assets → rsync deploy
- The script auto-detects the release remote (prefers `upstream` over `origin`) to match `glab`'s project target
- Monitor the output and report progress to the user

### Step 10: Report results

When complete, summarize:
- Version released
- GitLab Release URL
- Update server URL
- Any warnings or issues encountered

## Error handling

- If any step fails, stop and report the error clearly
- Do NOT attempt to continue after a failure
- Do NOT rollback automatically - tell the user what happened and let them decide
