# Make bash stop on first error
set -e

rm -rf deploy
mkdir deploy
mkdir deploy/public
mkdir deploy/misc

cp start_server.sh deploy
cp server.js deploy
cp package.json deploy
cp -R public deploy
cp -R misc deploy

# Bundle all the JS scripts
npm run build

# Remote deployment
SERVER_ADDR='noisecraft.app'
rsync -avz deploy "${SERVER_ADDR}:noisecraft"
ssh "${SERVER_ADDR}" "cd noisecraft/deploy && npm install && pm2 stop noisecraft && cp database.db db_backup.db && pm2 start noisecraft"
