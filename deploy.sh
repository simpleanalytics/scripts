#!/bin/bash
set -u
set -e

RED=`tput setaf 1`
GREEN=`tput setaf 2`
RESET=`tput sgr0`

scripts_path='./dist/latest/custom'
remote_path='app@external.simpleanalytics.com:/var/www/default'

if ! [[ $PWD = */scripts ]] || ! [[ -f "./dist/latest/custom/latest.js" ]]; then
  echo -e "==> ${RED}Not in scripts directory, killing script${RESET}"
  exit 1
fi

echo '==> You are about to deploy to production'

read -p "==> Are you sure? " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo '==> Minifying one more time'

  npm run minify

  if [[ `git status --porcelain` ]]; then
    echo -e "==> ${RED}There are changes in your repo, commit and test them first${RESET}"
    exit 1
  fi

  echo '==> Deploying to production'
  rsync --rsync-path="sudo rsync" "$scripts_path/e.js" "$remote_path/events.js"
  rsync --rsync-path="sudo rsync" "$scripts_path/e.js.map" "$remote_path/events.js.map"
  rsync --rsync-path="sudo rsync" "$scripts_path/latest.js" "$remote_path/latest.js"
  rsync --rsync-path="sudo rsync" "$scripts_path/latest.js.map" "$remote_path/latest.js.map"
  rsync --rsync-path="sudo rsync" "$scripts_path/light.js" "$remote_path/light.js"
  rsync --rsync-path="sudo rsync" "$scripts_path/light.js.map" "$remote_path/light.js.map"
  rsync --rsync-path="sudo rsync" "$scripts_path/proxy.js" "$remote_path/proxy.js"
  rsync --rsync-path="sudo rsync" "$scripts_path/proxy.js.map" "$remote_path/proxy.js.map"
  rsync --rsync-path="sudo rsync" "$scripts_path/../embed.js" "$remote_path/embed.js"
  rsync --rsync-path="sudo rsync" "$scripts_path/../embed.js.map" "$remote_path/embed.js.map"

  echo -e "==> ${GREEN}Woop woop! Deployed!${RESET}"
else
  echo '==> Cancelled by you'
fi


