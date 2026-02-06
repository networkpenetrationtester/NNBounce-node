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
            console.error(e); // this probably shouldn't happen, but yk just in case
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
    "OverrideCachePath"?: string,
    "Logger": {
        "Requests": boolean,
        "Verbose": boolean,
        "LogFile": boolean,
    },
    "HttpServer": {
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

const logger = new Logger(true, true, 'Totally_Sick_Logger');
const DIR = import.meta.dirname;
const HTTP_CACHE_PATH = path.join(DIR, 'www');
const LOG_PATH = path.join(DIR, 'logs');
const CONFIG_PATH = path.join(DIR, 'config.json');
const config: $config = (() => {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        logger.Log(`* ERROR: ${CONFIG_PATH} failed to load! Proceeding with defaults...`);
        let config = {
            "OverrideCachePath": HTTP_CACHE_PATH,
            "Logger": {
                "Requests": true,
                "Verbose": true,
                "LogFile": false
            },
            "HttpServer": {
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

const OVERRIDE_CACHE_PATH = config.OverrideCachePath ?? HTTP_CACHE_PATH;
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
    logger.Log(`Cache Path: \t\t${config.OverrideCachePath}`);
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

app.get('/Prelauncher.swf', (req, res) => {
    res.sendFile(path.join(HTTP_CACHE_PATH, 'Prelauncher.swf'));
});

app.get('/Loader.swf', (req, res) => {
    res.sendFile(path.join(HTTP_CACHE_PATH, 'Loader.swf'));
    return;
});

app.get('/socket_test.cfg', (req, res) => {
    res.sendFile(path.join(HTTP_CACHE_PATH, 'socket_test.cfg'));
    return;
});

app.get('/resources/*resource', async (req, res) => {
    let parts = req.url.split('?rand=');
    let [request, rand] = parts;

    if (request.match(/([\\:?*"<>|]|\.{2})+/)) {
        res.sendStatus(500);
    }

    let absolute_path = path.join(OVERRIDE_CACHE_PATH, request);
    let exists = fs.existsSync(absolute_path);

    if (!exists || !config.HttpServer.ServeCache) { // if the cached file doesn't exist or we don't wanna serve cache (updating content), download resource.
        let url = REMOTE_ENDPOINT + request + (rand ? '?rand=' + rand : '');
        if (config.Logger.Verbose) {
            logger.LogTime(`* Fetching: ${url}`);
        }
        await axios.get(url, { responseType: 'arraybuffer' })
            .then((result) => {
                let buffer = Buffer.from(result.data);
                if (config.HttpServer.StoreCache) {
                    fs.mkdirSync(path.dirname(absolute_path), { recursive: true });
                    fs.writeFileSync(absolute_path, buffer);
                }
                res.send(buffer);
            })
            .catch((e) => {
                console.error(e);
                res.sendStatus(500);
            });
    }

    if (exists && config.HttpServer.ServeCache) {
        if (config.Logger.Verbose) {
            logger.LogTime(`* Serving Cached: ${absolute_path}`);
        }
        res.sendFile(absolute_path);
    }
});

app.listen(config.HttpServer.LocalPort, config.HttpServer.LocalHostName, () => {
    logger.LogTime(`* HttpServer Forwarding ${HOSTED_ENDPOINT} -> ${REMOTE_ENDPOINT}.`);
});