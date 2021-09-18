export NODE_ENV=production

forever stop server.js

# Stores log file in ~/.forever/logfile.txt 
forever start -l noisecraft.log server.js
