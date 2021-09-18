export NODE_ENV=production

forever stop server.js
forever start -l noisecraft.log server.js