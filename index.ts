import express from 'express'
import fs from 'node:fs';
import path from 'path';
import axios from 'axios';

const app = express();

class Logger {
    verbose;
    usefile;
    filename;
    filepath;
    tag;

    constructor(verbose: boolean, usefile: boolean, tag: string = 'NNBounce') {
        this.verbose = verbose;
        this.usefile = usefile;
        this.tag = tag;
        this.filename = this.GetFileName();
        this.filepath = path.join('logs', this.filename);

        if (this.usefile) {
            if (!fs.existsSync(this.filepath)) {
                fs.writeFileSync(this.filepath, '', 'utf-8');
            }
        }
    }

    CustomDate() {
        let date = new Date();
        let date_string = date.toDateString();
        let time_string = date.toTimeString().split(' ')[0];
        return [date_string, time_string].join(' ');
    }

    GetFileName() {
        return `${this.tag}_${this.CustomDate().replaceAll(' ', '_').replaceAll(':', ';')}.txt`;
    }

    TimeStamp(line: string) {
        // DD/MM/YYYY, TT:TT:TT AM/PM
        return `[${new Date().toTimeString().split(' ')[0]}] ${line}`;
    }

    LogFile(line: string) {
        try {
            fs.appendFileSync(this.filepath, line + '\n', 'utf-8');
        } catch (e) {
            console.error(e); // this probably shouldn't happen, but yk just in case the thing is deleted while in use
        }
    }

    LogTime(data: any) {
        this.Log(data, true);
    }

    Log(data: any, timestamp = false) {
        let line = typeof data === 'object' ? JSON.stringify(data) : data.toString();
        timestamp && (line = this.TimeStamp(line));
        if (this.usefile) {
            this.LogFile(line);
        } else {
            console.log(line);
        }
    }
}

type $config = {
    "Logger": {
        "Requests": boolean, // log HTTP requests
        "Errors": boolean, // log various errors
        "Info": boolean, // log info (verbose)
        "LogFile": boolean, // output log to a file in ./logs
    },
    "HttpServer": {
        "StaticFiles"?: string[], // optionally specify files you do not want to ever be overwritten/ignored
        "OverrideCachePath"?: string, // optionally redirect cache (except for static files) to another folder (null for ./www)
        "DirBrowser"?: boolean, // primitive cache filebrowser
        "LocalHostName"?: string, // local IP/hostname (null for any)
        "LocalPort": number, // local port
        "Protocol": ('http' | 'https' | 'ftp'), // local protocol, maybe implement soon
        "RewriteCache": boolean, // download all files regardless of whether they're stored on disk
        "WriteCache": boolean, // download files to disk when missing & available
        "ServeCache": boolean, // send cached files from disk when possible
    },
    "Bouncer": {
        "Enabled": boolean, // enable the HTTP proxy
        "RemoteHostname": string, // remote IP/hostname
        "RemotePort": number, // remote port
        "Protocol": ('http' | 'https' | 'ftp') // remote protocol
    }
}

const DIR = import.meta.dirname;
const HTTP_CACHE_PATH = path.join(DIR, 'www');
const LOG_PATH = path.join(DIR, 'logs');
const CONFIG_PATH = path.join(DIR, 'config.json');
const config: $config = (() => {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        console.error(e);
        console.log(`* ERROR: ${CONFIG_PATH} failed to load! Proceeding with defaults...`);
        return {
            "Logger": {
                "Requests": true, // log HTTP requests
                "Errors": true, // log various errors
                "Info": true, // log info (verbose)
                "LogFile": false, // output log to a file in ./logs
            },
            "HttpServer": {
                "StaticFiles": [], // optionally specify files you do not want to ever be overwritten/ignored
                "OverrideCachePath": null, // optionally redirect cache (except for static files) to another folder (null for ./www)
                "DirBrowser": false, // primitive cache filebrowser
                "LocalHostName": "localhost", // local IP/hostname (null for any)
                "LocalPort": "8080", // local port
                "Protocol": "http", // local protocol, maybe implement soon
                "RewriteCache": false, // download all files regardless of whether they're stored on disk
                "WriteCache": true, // download files to disk when missing & available
                "ServeCache": true, // send cached files from disk when possible
            },
            "Bouncer": {
                "Enabled": true, // enable the HTTP proxy
                "RemoteHostname": "example.org", // remote IP/hostname
                "RemotePort": 443, // remote port
                "Protocol": "https" // remote protocol
            }
        };
    }
})();

const logger = new Logger(true, config.Logger.LogFile); // circular dependency headass
const OVERRIDE_CACHE_PATH = config.HttpServer.OverrideCachePath ?? HTTP_CACHE_PATH;
const REMOTE_ENDPOINT = `${config.Bouncer.Protocol}://${config.Bouncer.RemoteHostname}:${config.Bouncer.RemotePort}`;
const HOSTED_ENDPOINT = `${config.HttpServer.Protocol}://${config.HttpServer.LocalHostName ?? '*'}:${config.HttpServer.LocalPort}`;

if (!fs.existsSync(HTTP_CACHE_PATH)) { // maybe some people would want this to be created where the process is started? Most likely not though
    fs.mkdirSync(HTTP_CACHE_PATH);
    logger.Log(`📁 Created www directory: ${HTTP_CACHE_PATH}`);
}

if (!fs.existsSync(LOG_PATH)) {
    fs.mkdirSync(LOG_PATH);
    logger.Log(`📁 Created logs directory: ${LOG_PATH}`);
}

logger.Log(`⏰ Program Started @ ${logger.CustomDate()}`);
if (config.Logger.Info) {
    logger.Log(` ℹ Remote Endpoint:\t${REMOTE_ENDPOINT}`);
    logger.Log(` ℹ Hosted Endpoint: \t${HOSTED_ENDPOINT}`);
    logger.Log(` ℹ Cache Path: \t\t${OVERRIDE_CACHE_PATH}`);
    logger.Log(` ℹ Dir Browser:\t\t${config.HttpServer.DirBrowser ? 'enabled' : 'disabled'}`);
    logger.Log(` ℹ Bouncer:\t\t${config.Bouncer.Enabled ? 'enabled' : 'disabled'}`);
    logger.Log(` ℹ Rewriting Cache:\t${config.HttpServer.RewriteCache}`);
    logger.Log(` ℹ Writing Cache:\t${config.HttpServer.WriteCache}`);
    logger.Log(` ℹ Serving Cache:\t${config.HttpServer.ServeCache}`);
    logger.Log('');
}

const RequestLogger: express.RequestHandler = (req, res, next) => {
    let strings = [
        '🔽',
        req.ips.length > 0 ? `[${req.ips.join(', ')}]` : req.ip,
        req.method,
        req.url,
        req.body
    ];
    !req.body && strings.pop(); // ELITE TRICKERY!
    logger.LogTime(strings.join(' '));
    return next();
}

config.Logger.Requests && app.use(RequestLogger);

if (config.HttpServer.StaticFiles) { // Wow I did it, I made it universal...
    if (config.HttpServer.StaticFiles.length > 0) {
        logger.Log(`🔒 These files will not be overwritten by cache (${HTTP_CACHE_PATH})`);
    }
    for (let file of config.HttpServer.StaticFiles) {
        let filepath = path.join(HTTP_CACHE_PATH, file);
        let exists = fs.existsSync(filepath);

        exists && logger.Log(` ℹ File will be statically served: ${file}`);
        !exists && logger.Log(`🚨 Static file mapping invalid! Attempting to request this will result in a 404: ${file}`);
        app.get('/' + file, (req, res) => {
            config.Logger.Info && logger.LogTime(`${exists ? '🔒 Serving Static' : '🚨 No Such Static File'}: ${filepath}`);
            exists ? res.sendFile(filepath) : res.sendStatus(404);
            return;
        });
    }
    logger.Log('');
}

function dirBrowse(real_path: string, web_path: string, checked: boolean = false): string { // generate barebones html file browser
    if (checked || (fs.existsSync(real_path) && fs.statSync(real_path).isDirectory())) {
        let children = ['..', ...fs.readdirSync(real_path)];
        let links = children.map((child) => {
            return `<div><a href="${path.join('/', web_path, child)}">${child}</a></div>`;
        });
        return [
            '<!DOCTYPE html>',
            '<html>',
            /****/'<head>',
            /****//****/'<title>NNBounce File Browser</title>',
            /****/'</head>',
            /****/'<style>',
            /****//****/'a { color: #00ffff; }',
            /****/'</style>',
            /****/'<body style="background: #000000">',
            /****//****/...links,
            /****/'</body>',
            '</html>'
        ].join('\n');
    }
    return '404';
}

app.get('/', async (req, res) => {
    if (config.HttpServer.DirBrowser) {
        res.send(dirBrowse(OVERRIDE_CACHE_PATH, '/'));
        return;
    } else {
        let url = REMOTE_ENDPOINT;
        config.Logger.Info && logger.LogTime(`🐕 Fetching: ${url}`);
        await axios.get(url)
            .then(async (result) => {
                logger.LogTime(`📝 Serving Buffered: ${url}`);
                res.send(result.data);
                return;
            }).catch((e) => {
                logger.LogTime(['❌', e.status, e.code].join(' '));
                res.sendStatus(e.status);
                return;
            });
    }
});

app.get('/*resource', async (req, res) => {
    try {
        let parts = req.url.split('?');
        let [resource, querystring] = parts;

        if (resource.match(/([\\:?*"<>|]|\.{2})+/)) {
            res.sendStatus(418); // No hacking for you!
            return;
        }

        let absolute_path = path.join(OVERRIDE_CACHE_PATH, resource);
        let exists = fs.existsSync(absolute_path);

        // handle shit for:
        // serving from the disk exclusively, serving from online exclusively, and writing to the disk & serving that
        
        // if bouncer && (rewrite && exists || store && !exists) -> write to disk & send buffer content straight to client
        // else
        // if exists && serve && !rewrite -> send data from disk to client


        if (exists && fs.statSync(absolute_path).isDirectory()) {
            if (config.HttpServer.DirBrowser) {

                res.send(dirBrowse(absolute_path, resource, true));
                return;
            } else {
                res.sendStatus(429);
                return;
            }
        }

        if (!exists && (config.HttpServer.ServeCache || config.HttpServer.WriteCache)) { // only care if we're supposed to have that
            config.Logger.Info && logger.LogTime(`🚨 No Such File/Directory: ${absolute_path}`);
        }

        if (config.Bouncer.Enabled && !exists || !config.HttpServer.ServeCache) { // if the cached file doesn't exist or we wanna update cache and the bouncer is on
            let url = REMOTE_ENDPOINT + resource + (querystring ? '?' + querystring : '');
            config.Logger.Info && logger.LogTime(`🐕 Fetching: ${url}`);
            await axios.get(url, { responseType: 'arraybuffer' }) // HAS to be array buffer, otherwise won't save to cache properly...
                .then((result) => {
                    let buffer = Buffer.from(result.data);
                    if (config.HttpServer.WriteCache) { // if we wanna write to cache
                        fs.mkdirSync(path.dirname(absolute_path), { recursive: true });
                        config.Logger.Info && logger.LogTime(`💿 Writing: ${url} -> ${absolute_path}`);
                        fs.writeFileSync(absolute_path, buffer);
                    }
                    logger.LogTime(`📝 Serving Buffered: ${url}`);
                    let type = path.extname(resource);
                    type && res.type(type);
                    res.send(buffer);
                    return;
                }).catch((e) => {
                    logger.LogTime(['❌', e.status, e.code].join(' '));
                    res.sendStatus(e.status);
                    return;
                });
        }

        if (exists && config.HttpServer.ServeCache) {
            logger.LogTime(`💿 Serving Cached: ${absolute_path}`);
            res.sendFile(absolute_path); // automatically sets response type.
            return;
        }
    } catch (e) {
        console.error(e);
        res.send(500);
    }
});

let message = `🌐 HttpServer ${config.Bouncer.Enabled ? 'Proxying' : 'Running'}: ${HOSTED_ENDPOINT}${config.Bouncer.Enabled ? ' -> ' + REMOTE_ENDPOINT : ''}\n`;

if (config.HttpServer.LocalHostName) {
    app.listen(config.HttpServer.LocalPort, config.HttpServer.LocalHostName, () => {
        logger.LogTime(message);
    });
} else {
    app.listen(config.HttpServer.LocalPort, () => {
        logger.LogTime(message);
    });
}