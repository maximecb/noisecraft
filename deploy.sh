SERVER_ADDR='noisecraft.app'

# Make bash stop on first error
set -e

rm -rf deploy
mkdir deploy
mkdir deploy/public

cp start_server.sh deploy
cp server.js deploy
cp converter.js deploy
cp package.json deploy
cp -R public deploy

rsync -avz deploy "${SERVER_ADDR}:noisecraft"
rm -rf deploy

ssh "${SERVER_ADDR}" "cd noisecraft/deploy && npm install && pm2 stop noisecraft && cp database.db db_backup.db && pm2 start noisecraft"
