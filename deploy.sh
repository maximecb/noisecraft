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

# Rollup all modules into one
rm -rf deploy/public/*.js
rollup public/main.js --file deploy/public/main.js --format es

# Minify the JavaScript, eliminate comments and console prints
terser --compress drop_console=true --mangle toplevel --output deploy/public/main.js -- deploy/public/main.js

# Make sure minification was successful
if grep "// " deploy/public/*.js; then
    echo "*** MINIFICATION FAILED, ABORTING ***"
    exit 1
fi
if grep "console " deploy/public/*.js; then
    echo "*** MINIFICATION FAILED, ABORTING ***"
    exit 1
fi

#rsync -avz deploy "$1@${SERVER_ADDR}:noisecraft"
rm -rf deploy

#ssh "$1@${SERVER_ADDR}" "cd noisecraft/deploy && npm install && forever restart server.js"
