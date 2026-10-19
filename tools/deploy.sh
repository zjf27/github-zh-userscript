#!/usr/bin/env bash
# 创建私有仓库并推送。凭据来自本机 git credential helper（DSH manager）。
set -euo pipefail
cd "$(dirname "$0")/.."

creds=$(printf 'protocol=https\nhost=github.com\n\n' | MSYS_NO_PATHCONV=1 git credential fill 2>/dev/null || true)
tok=$(printf '%s\n' "$creds" | sed -n 's/^password=//p')
user=$(printf '%s\n' "$creds" | sed -n 's/^username=//p')
if [ -z "$tok" ] || [ -z "$user" ]; then echo "NO_TOKEN"; exit 2; fi
echo "user=$user token_len=${#tok}"

code=$(curl -sS -m 30 --ssl-no-revoke -o /tmp/create_repo.json -w '%{http_code}' -X POST \
  -H "Authorization: token $tok" -H 'Accept: application/vnd.github+json' -H 'Content-Type: application/json' \
  https://api.github.com/user/repos \
  -d '{"name":"github-zh-userscript","private":true,"description":"GitHub 界面中文化用户脚本（原创实现，不翻译用户内容）"}')
echo "create_repo_http=$code"
head -c 200 /tmp/create_repo.json; echo

if [ ! -d .git ]; then git init -b main >/dev/null; fi
git add -A
if ! git diff --cached --quiet; then
  git -c user.name="$user" -c user.email="$user@users.noreply.github.com" commit -m "初始提交：GitHub 界面中文化用户脚本（词典 1089 条）"
else
  echo "nothing to commit"
fi

git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$user/github-zh-userscript.git"
auth=$(printf '%s:%s' "$user" "$tok" | base64 | tr -d '\n')
git -c "http.extraHeader=Authorization: Basic $auth" push -u origin main
echo "PUSH_DONE"
