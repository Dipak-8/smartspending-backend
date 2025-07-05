#!/bin/bash

# Download and extract Chromium
apt-get update
apt-get install -y wget unzip

mkdir -p /opt/chrome

wget https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/1171765/chrome-linux.zip
unzip chrome-linux.zip -d /opt/chrome
mv /opt/chrome/chrome-linux /opt/chrome/chrome
