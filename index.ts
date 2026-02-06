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
        "Requests": boolean,
        "Verbose": boolean,
        "LogFile": boolean,
    },
    "HttpServer": {
        "OverrideCachePath"?: string,
        "DirBrowser"?: boolean,
        "StaticFiles"?: string[],
        "LocalHostName": string,
        "LocalPort": number,
        "Protocol": 'http'/*  | 'https' | 'ftp', */,
        "StoreCache": boolean,
        "ServeCache": boolean,
    },
    "Bouncer": {
        "RemoteHostname": string,
        "RemotePort": number,
        "Protocol": 'http' | 'https' | 'ftp',
    }
}

const DIR = import.meta.dirname;
const HTTP_CACHE_PATH = path.join(DIR, 'www');
const LOG_PATH = path.join(DIR, 'logs');
const CONFIG_PATH = path.join(DIR, 'config.json');
const logger = new Logger(true, false); // circular dependency headass
const config: $config = (() => {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        console.error(e);
        logger.Log(`* ERROR: ${CONFIG_PATH} failed to load! Proceeding with defaults...`);
        let config = {
            "BasePath": null,
            "OverrideCachePath": HTTP_CACHE_PATH,
            "Logger": {
                "Requests": true,
                "Verbose": true,
                "LogFile": false
            },
            "HttpServer": {
                "DirBrowser": false,
                "StaticFiles": [],
                "LocalHostName": "localhost",
                "LocalPort": 8080,
                "Protocol": "http",
                "StoreCache": false,
                "ServeCache": true
            },
            "Bouncer": {
                "RemoteHostname": "resources.oldtanksonline.ru",
                "RemotePort": 443,
                "Protocol": "https"
            }
        };
        return config;
    }
})();

logger.usefile = config.Logger.LogFile; // oh well its rough but it works :3

const OVERRIDE_CACHE_PATH = config.HttpServer.OverrideCachePath ?? HTTP_CACHE_PATH;
const REMOTE_ENDPOINT = `${config.Bouncer.Protocol}://${config.Bouncer.RemoteHostname}:${config.Bouncer.RemotePort}`;
const HOSTED_ENDPOINT = `${config.HttpServer.Protocol}://${config.HttpServer.LocalHostName}:${config.HttpServer.LocalPort}`;

if (!fs.existsSync(HTTP_CACHE_PATH)) { // maybe some people would want this to be created where the process is started? Most likely not though
    fs.mkdirSync(HTTP_CACHE_PATH);
    logger.Log(`* Created www directory: ${HTTP_CACHE_PATH}`);
}

if (!fs.existsSync(LOG_PATH)) {
    fs.mkdirSync(LOG_PATH);
    logger.Log(`* Created logs directory: ${LOG_PATH}`);
}

if (config.Logger.Verbose) {
    logger.Log(`* Program Started @ ${logger.CustomDate()}.`);
    logger.Log(`Remote Endpoint:\t${REMOTE_ENDPOINT}`);
    logger.Log(`Hosted Endpoint: \t${HOSTED_ENDPOINT}`);
    logger.Log(`Cache Path: \t\t${OVERRIDE_CACHE_PATH}`);
    logger.Log(`Dir Browser:\t\t${config.HttpServer.DirBrowser ? 'enabled' : 'disabled'}`);
    logger.Log(`Storing Cache:\t\t${config.HttpServer.StoreCache}`);
    logger.Log(`Serving Cache:\t\t${config.HttpServer.ServeCache}`);
    logger.Log('');
}

const RequestLogger: express.RequestHandler = (req, res, next) => {
    if (config.Logger.Requests) {
        let strings = [
            req.host,
            req.method,
            req.url,
            req.body
        ];
        (req.method == 'POST' || !req.body) && strings.pop(); // ELITE TRICKERY!
        logger.LogTime(strings.join(' '));
    }
    return next();
}

app.use(RequestLogger);

if (config.HttpServer.StaticFiles) { // Wow I did it, I made it universal...
    for (let file of config.HttpServer.StaticFiles) {
        config.Logger.Verbose && logger.Log(`* File will be statically served: ${file}`);
        app.get(file, (req, res) => {
            let filepath = path.join(OVERRIDE_CACHE_PATH, file)
            if (fs.existsSync(filepath)) {
                logger.LogTime(`* Serving Static: ${filepath}`);
                res.sendFile(filepath);
                return;
            } else {
                res.send(404);
                return;
            }
        });
    }
    logger.Log('');
}

function dirBrowse(real_path: string, web_path: string, checked: boolean = false): string { // generate barebones html file browser
    if (checked || fs.existsSync(real_path) && fs.statSync(real_path).isDirectory()) {
        let children = ['..', ...fs.readdirSync(real_path)];
        let links = children.map((child) => {
            return `<div><a href="${path.join('/', web_path, child)}">${child}</a></div>`;
        });
        return ['<html>', '<body>', ...links, '</body>', '</html>'].join('\n');
    }
    return 'Not a Directory...';
}

app.get('/', (req, res) => {
    config.HttpServer.DirBrowser ? res.send(dirBrowse(OVERRIDE_CACHE_PATH, '/')) : res.sendStatus(404);
    return;
});

app.get('/*resource', async (req, res) => {
    try {
        let parts = req.url.split('?rand=');
        let [request, rand] = parts;

        if (request.match(/([\\:?*"<>|]|\.{2})+/)) {
            res.sendStatus(418); // No hacking for you!
            return;
        }

        let absolute_path = path.join(OVERRIDE_CACHE_PATH, request);
        let exists = fs.existsSync(absolute_path);

        if (exists && fs.statSync(absolute_path).isDirectory()) {
            config.HttpServer.DirBrowser ? res.send(dirBrowse(absolute_path, request, true)) : res.sendStatus(404);
            return;
        }

        if (!exists || !config.HttpServer.ServeCache) { // if the cached file doesn't exist or we wanna update cache
            let url = path.join(REMOTE_ENDPOINT, request) + rand ? '?rand=' + rand : '';
            config.Logger.Verbose && logger.LogTime(`* Fetching: ${url}`);
            await axios.get(url, { responseType: 'arraybuffer' })
                .then((result) => {
                    let buffer = Buffer.from(result.data);
                    if (config.HttpServer.StoreCache) { // if we wanna write to cache
                        fs.mkdirSync(path.dirname(absolute_path), { recursive: true });
                        config.Logger.Verbose && logger.LogTime(`* Writing: ${url} -> ${absolute_path}`);
                        fs.writeFileSync(absolute_path, buffer);
                    }
                    config.Logger.Verbose && logger.LogTime(`* Serving Buffered: ${url}`);
                    res.send(buffer);
                    return;
                }).catch((e) => {
                    res.sendStatus(e?.status || 500);
                    return;
                });
        }

        if (exists && config.HttpServer.ServeCache) {
            config.Logger.Verbose && logger.LogTime(`* Serving Cached: ${absolute_path}`);
            res.sendFile(absolute_path);
            return;
        }
    } catch (e) {
        console.error(e);
        res.send(500);
    }
});

app.listen(config.HttpServer.LocalPort, config.HttpServer.LocalHostName, () => {
    logger.LogTime(`* HttpServer Forwarding: ${HOSTED_ENDPOINT} -> ${REMOTE_ENDPOINT}.`);
});