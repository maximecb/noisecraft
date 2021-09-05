SERVER_ADDR='noisecraft.app'

# Make bash stop on first error
set -e

rm -rf deploy
mkdir deploy
mkdir deploy/public

cp start_server.sh deploy
cp stop_server.sh deploy
cp server.js deploy
cp package.json deploy
cp -R public deploy

rsync -avz deploy "${SERVER_ADDR}:noisecraft"
rm -rf deploy

ssh "${SERVER_ADDR}" "cd noisecraft/deploy && npm install && forever restart server.js"
