# Make sure server is closed.
node_pid=$(pidof node)
if [ $node_pid = "" ]; then
    echo "Server is not running..."
else
    echo "Stopping server..."
    $(kill $node_pid)
fi
clear

# Audit fix, download dependencies, build, and run!
node --run build
clear
node index.js
