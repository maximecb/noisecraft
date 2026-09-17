# Make bash stop on first error
set -e

rm -rf deploy
mkdir deploy
mkdir deploy/public
mkdir deploy/misc

cp server.js deploy
cp package.json deploy
cp package-lock.json deploy
cp -R public deploy

# Bundle all the JS scripts
npm run build

# Remote deployment.
# The noisecraft-prod host is an SSH alias, user and port live in ~/.ssh/config
SERVER_ADDR='noisecraft-prod'
# No -p/-g/-o: the setgid /srv/noisecraft (2750) keeps its mode, and new files
# inherit the noisecraft group. After npm ci, the whole tree is reset to
# group-readable, no world access, so the app can read what it needs no matter
# what permissions the files had locally.
rsync -rltvz deploy/ "${SERVER_ADDR}:/srv/noisecraft/"
ssh "${SERVER_ADDR}" "cd /srv/noisecraft && umask 027 && npm ci --omit=dev && chgrp -R noisecraft . && chmod -R u+rwX,g+rX,g-w,o-rwx . && chmod g+s . && sudo systemctl restart noisecraft"
