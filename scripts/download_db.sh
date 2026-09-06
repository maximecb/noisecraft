SERVER_ADDR='noisecraft.app'

# Make bash stop on first error
set -e

ssh "${SERVER_ADDR}" "pm2 stop noisecraft"

DATE=$(date +"%Y-%m-%d")
rsync -avz "${SERVER_ADDR}:noisecraft/deploy/database.db" "${DATE}-database.db"

# Keep one copy in dropbox
cp "${DATE}-database.db" /Users/maximecb/Dropbox/Projects/noisecraft/database.db

ssh "${SERVER_ADDR}" "pm2 start noisecraft"
