#!/bin/bash

set -u
set -e

(sleep 0.5 && open http://localhost:5001/playground/events.html?project=xxx) &

python3 -m http.server 5001 --bind '127.0.0.1'
