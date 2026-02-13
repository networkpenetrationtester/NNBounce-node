:: Make sure server is closed.
taskkill /IM node.exe /F

:: Audit fix, download dependencies, build, and run!
node.exe --run build
node.exe index.js
cls