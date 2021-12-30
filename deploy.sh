#!/bin/bash
set -u
set -e

RED=`tput setaf 1`
GREEN=`tput setaf 2`
RESET=`tput sgr0`

SERVER_NAME="external.simpleanalytics.com"
SCRIPTS_LATEST_PATH='./dist/latest/custom'
REMOTE_PATH='app@external.simpleanalytics.com:/var/www/default'

if ! [[ $PWD = */scripts ]] || ! [[ -f "./dist/latest/custom/latest.js" ]]; then
  echo -e "==> ${RED}Not in scripts directory, killing script${RESET}"
  exit 1
fi

if [[ `git status --porcelain` ]]; then
  echo -e "==> ${RED}There are changes in your repo, commit and test them first${RESET}"
  exit 1
fi

read -p "==> Specify the latest SRI version: " VERSION

LATEST_FILE="./dist/v$VERSION/v$VERSION.js"
SRI_FILE="./dist/v$VERSION/custom/v$VERSION.js"

if [ ! -f "$LATEST_FILE" ] || [ ! -f "$SRI_FILE" ]; then
  echo "==> Files with version v$VERSION do not exist."
  exit 1
fi

echo "==> You are about to deploy to $SERVER_NAME"
read -p "==> Are you sure (y/N)? "  -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo '==> Minifying one more time'

  npm run minify

  if [[ `git status --porcelain` ]]; then
    echo -e "==> ${RED}There are changes in your repo, commit and test them first${RESET}"
    exit 1
  fi

  echo "==> Deploying non SRI v$VERSION files to $SERVER_NAME"
  rsync --rsync-path="sudo rsync" "$SCRIPTS_LATEST_PATH/auto-events.js" "$REMOTE_PATH/auto-events.js"
  rsync --rsync-path="sudo rsync" "$SCRIPTS_LATEST_PATH/auto-events.js.map" "$REMOTE_PATH/auto-events.js.map"
  rsync --rsync-path="sudo rsync" "$SCRIPTS_LATEST_PATH/e.js" "$REMOTE_PATH/events.js"
  rsync --rsync-path="sudo rsync" "$SCRIPTS_LATEST_PATH/e.js.map" "$REMOTE_PATH/events.js.map"
  rsync --rsync-path="sudo rsync" "$SCRIPTS_LATEST_PATH/latest.dev.js" "$REMOTE_PATH/latest.dev.js"
  rsync --rsync-path="sudo rsync" "$SCRIPTS_LATEST_PATH/latest.js" "$REMOTE_PATH/latest.js"
  rsync --rsync-path="sudo rsync" "$SCRIPTS_LATEST_PATH/latest.js.map" "$REMOTE_PATH/latest.js.map"
  rsync --rsync-path="sudo rsync" "$SCRIPTS_LATEST_PATH/light.js" "$REMOTE_PATH/light.js"
  rsync --rsync-path="sudo rsync" "$SCRIPTS_LATEST_PATH/light.js.map" "$REMOTE_PATH/light.js.map"
  rsync --rsync-path="sudo rsync" "$SCRIPTS_LATEST_PATH/proxy.js" "$REMOTE_PATH/proxy.js"
  rsync --rsync-path="sudo rsync" "$SCRIPTS_LATEST_PATH/proxy.js.map" "$REMOTE_PATH/proxy.js.map"

  echo "==> Creating v$VERSION folder on $SERVER_NAME"
  ssh app@external.simpleanalytics.com mkdir -p "/var/www/default/v$VERSION"

  echo "==> Copying SRI v$VERSION file to $SERVER_NAME"
  rsync --quiet --rsync-path="sudo rsync" "./dist/v$VERSION/custom/v$VERSION.js" "$REMOTE_PATH/v$VERSION/app.js"
  rsync --quiet --rsync-path="sudo rsync" "./dist/v$VERSION/custom/v$VERSION.js.map" "$REMOTE_PATH/v$VERSION/app.js.map"
  rsync --quiet --rsync-path="sudo rsync" "./dist/v$VERSION/custom/light.js" "$REMOTE_PATH/v$VERSION/light.js"
  rsync --quiet --rsync-path="sudo rsync" "./dist/v$VERSION/custom/light.js.map" "$REMOTE_PATH/v$VERSION/light.js.map"
  rsync --quiet --rsync-path="sudo rsync" "./dist/v$VERSION/custom/auto-events.js" "$REMOTE_PATH/v$VERSION/auto-events.js"
  rsync --quiet --rsync-path="sudo rsync" "./dist/v$VERSION/custom/auto-events.js.map" "$REMOTE_PATH/v$VERSION/auto-events.js.map"

  echo -e "==> ${GREEN}Woop woop! Deployed to $SERVER_NAME!${RESET}"
else
  echo '==> Cancelled by you'
fi
