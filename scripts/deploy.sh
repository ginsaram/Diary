#!/usr/bin/env bash
# dist/ 빌드 결과를 gh-pages 브랜치로 올려 GitHub Pages 에 배포합니다.
# 사용법: npm run deploy
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "1/3 빌드 중..."
npm run build

BRANCH="gh-pages"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/diary-deploy-XXXXXX")"

# 커밋 작성자 정보가 없으면 이 저장소의 GitHub 계정 이름으로 남깁니다.
IDENT=()
if ! git config user.email >/dev/null 2>&1 || [ -z "$(git config user.email || true)" ]; then
  IDENT=(-c user.name="ginsaram" -c user.email="297652998+ginsaram@users.noreply.github.com")
fi

echo "2/3 배포 브랜치 준비 중..."
git worktree add --detach --quiet "$WORK" HEAD

(
  cd "$WORK"
  git checkout --quiet --orphan "$BRANCH"
  git rm -rq --cached . >/dev/null 2>&1 || true
  find . -mindepth 1 -maxdepth 1 -not -name .git -exec rm -rf {} +
  cp -R "$ROOT/dist/." .
  # GitHub Pages 가 Jekyll 처리를 하지 않도록 합니다.
  touch .nojekyll
  git add -A
  git "${IDENT[@]}" commit -q -m "배포: $(date '+%Y-%m-%d %H:%M')"
  git push -f origin "HEAD:refs/heads/$BRANCH"
)

echo "3/3 정리 중..."
git worktree remove --force "$WORK" >/dev/null 2>&1 || rm -rf "$WORK"
git branch -D "$BRANCH" >/dev/null 2>&1 || true

echo "배포 완료: https://ginsaram.github.io/Diary/"
