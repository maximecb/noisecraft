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
rsync -avz deploy/ "${SERVER_ADDR}:/srv/noisecraft/"
ssh "${SERVER_ADDR}" "cd /srv/noisecraft && npm ci --omit=dev && sudo systemctl restart noisecraft"
