SERVER_ADDR='noisecraft.app'

# Make bash stop on first error
set -e

ssh "${SERVER_ADDR}" "pm2 stop noisecraft"

DATE=$(date +"%Y-%m-%d")
rsync -avz "${SERVER_ADDR}:noisecraft/deploy/database.db" "${DATE}-database.db"

ssh "${SERVER_ADDR}" "pm2 start noisecraft"
