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

if [ -f .env ]; then
    export $(grep -v '^#' .env | sed 's/\r$//' | awk '/=/ {print $1}' )
else
  echo "==> Can not find .env variables"
  exit 1
fi

if [[ -z ${BUNNY_SCRIPTS_ACCESS_KEY+x} || -z ${BUNNY_SCRIPTS_ACCOUNT_KEY+x} ]]; then
  echo "==> Make sure BUNNY_SCRIPTS_ACCESS_KEY and BUNNY_SCRIPTS_ACCOUNT_KEY are defined in .env"
  exit 1
fi

upload_to_bunny() {
  local_file=$1
  remote_file=$2
  find=${3:-}
  replace=${4:-}

  if [ ! -z "$find" ] && [ ! -z "$replace" ]; then
    sed "s/$find/$replace/g" $local_file > /tmp/tmp_file
    put_response=$(curl \
      --request PUT \
      --url "https://storage.bunnycdn.com/sa-cdn/$remote_file" \
      --header "AccessKey: $BUNNY_SCRIPTS_ACCESS_KEY" \
      --upload-file "/tmp/tmp_file" \
      --output - \
      --silent \
      -w "%{stdout} %{http_code}"
    )
    rm /tmp/tmp_file
  else
    put_response=$(curl \
      --request PUT \
      --url "https://storage.bunnycdn.com/sa-cdn/$remote_file" \
      --header "AccessKey: $BUNNY_SCRIPTS_ACCESS_KEY" \
      --upload-file "$local_file" \
      --output - \
      --silent \
      -w "%{stdout} %{http_code}"
    )
  fi

  if ! [[ $put_response = *201* ]]; then
    echo "==> Failed to update $remote_file, got http code: $put_response"
    exit 1
  fi
}

read -p "==> Specify the latest SRI version: " VERSION

LATEST_FILE="./dist/v$VERSION/app.js"
SRI_FILE="./dist/v$VERSION/custom/app.js"

if [ ! -f "$LATEST_FILE" ] || [ ! -f "$SRI_FILE" ]; then
  echo "==> Files with version v$VERSION do not exist."
  exit 1
fi

echo "==> You are about to deploy to $SERVER_NAME"
read -p "==> Are you sure (y/N)? "  -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo '==> Compiling one more time'

  npm run build

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

  echo "==> Copying SRI v$VERSION file to $SERVER_NAME"
  rsync --quiet --rsync-path="sudo mkdir -p $REMOTE_PATH/v$VERSION && sudo rsync" "./dist/v$VERSION/custom/app.js" "$REMOTE_PATH/v$VERSION/app.js"
  rsync --quiet --rsync-path="sudo rsync" "./dist/v$VERSION/custom/app.js.map" "$REMOTE_PATH/v$VERSION/app.js.map"
  rsync --quiet --rsync-path="sudo rsync" "./dist/v$VERSION/custom/light.js" "$REMOTE_PATH/v$VERSION/light.js"
  rsync --quiet --rsync-path="sudo rsync" "./dist/v$VERSION/custom/light.js.map" "$REMOTE_PATH/v$VERSION/light.js.map"
  rsync --quiet --rsync-path="sudo rsync" "./dist/v$VERSION/custom/auto-events.js" "$REMOTE_PATH/v$VERSION/auto-events.js"
  rsync --quiet --rsync-path="sudo rsync" "./dist/v$VERSION/custom/auto-events.js.map" "$REMOTE_PATH/v$VERSION/auto-events.js.map"

  echo "==> Upload files to Bunny"
  upload_to_bunny "dist/v${VERSION}/app.js" "sri/v${VERSION}.js" "app.js.map" "v${VERSION}.js.map"
  upload_to_bunny "dist/v${VERSION}/app.js.map" "sri/v${VERSION}.js.map" "app.js" "v${VERSION}.js"
  upload_to_bunny "dist/latest/auto-events.js" "auto-events.js"
  upload_to_bunny "dist/latest/auto-events.js.map" "auto-events.js.map"
  upload_to_bunny "dist/latest/hello.js" "hello.js"
  upload_to_bunny "dist/latest/hello.js.map" "hello.js.map"
  upload_to_bunny "dist/latest/latest.dev.js" "latest.dev.js"
  upload_to_bunny "dist/latest/latest.js" "latest.js"
  upload_to_bunny "dist/latest/latest.js.map" "latest.js.map"
  upload_to_bunny "dist/latest/light.js" "light.js"
  upload_to_bunny "dist/latest/light.js.map" "light.js.map"

  echo "==> Flushing files on Bunny"
  flush_response=$(curl \
    --request POST \
    --header "AccessKey: $BUNNY_SCRIPTS_ACCOUNT_KEY" \
    --url "https://api.bunny.net/purge?url=https://simpleanalyticscdn.b-cdn.net/*" \
    --output - \
    --silent \
    -w "%{stdout} %{http_code}"
  )

  if ! [[ $flush_response = *200 ]]; then
    echo "==> Failed to flush $cdnfilename, got http code: $flush_response"
    exit 1
  fi

  echo -e "==> ${GREEN}Woop woop! Deployed to $SERVER_NAME!${RESET}"
else
  echo '==> Cancelled by you'
fi
