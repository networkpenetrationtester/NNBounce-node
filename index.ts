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

    constructor(verbose: boolean, usefile: boolean) {
        this.verbose = verbose;
        this.usefile = usefile;
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
        return `NNBounce_${this.CustomDate().replaceAll(' ', '_').replaceAll(':', ';')}.txt`;
    }

    TimeStamp(line: string) {
        // DD/MM/YYYY, TT:TT:TT AM/PM
        return `[${new Date().toTimeString().split(' ')[0]}]\t${line}`;
    }

    LogFile(line: string) {
        fs.appendFileSync(this.filepath, line + '\n', 'utf-8');
    }

    Log(data: any, timestamp = true) {
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
    "BasePath"?: string,
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

const DIR = import.meta.dirname;
const CONFIG_PATH = path.join(DIR, 'config.json');
const config: $config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const LOCAL_HTTP_CACHE = path.join(DIR, 'www');
const CUSTOM_HTTP_CACHE = config.BasePath ?? LOCAL_HTTP_CACHE;

let logger = new Logger(true, false);
let remote_full = `${config.Bouncer.Protocol}://${config.Bouncer.RemoteHostname}:${config.Bouncer.RemotePort}`;
let hosted_full = `${config.HttpServer.Protocol}://${config.HttpServer.LocalHostName}:${config.HttpServer.LocalPort}`;

if (config.Logger.Verbose) {
    logger.Log(`* Program Started @ ${logger.CustomDate()}`, false);
    logger.Log(`Remote Endpoint:\t${remote_full}`, false);
    logger.Log(`Hosted Endpoint: \t${hosted_full}`, false);
    logger.Log(`Storing Cache:\t\t${config.HttpServer.StoreCache}`, false);
    logger.Log(`Serving Cache:\t\t${config.HttpServer.ServeCache}`, false);
    logger.Log('', false);
}

const RequestLogger: express.RequestHandler = (req, res, next) => {
    if (config.Logger.Requests)
        logger.Log(
            [
                req.host,
                req.method,
                req.url,
                req.body ? 'Request Body:' + JSON.stringify(req.body) : '\b',
            ].join(' '));
    return next();
}

app.use(RequestLogger);

app.get('/Prelauncher.swf', (req, res) => {
    res.sendFile(path.join(LOCAL_HTTP_CACHE, 'Prelauncher.swf'));
});

app.get('/Loader.swf', (req, res) => {
    res.sendFile(path.join(LOCAL_HTTP_CACHE, 'Loader.swf'));
    return;
});

app.get('/socket_test.cfg', (req, res) => {
    res.sendFile(path.join(LOCAL_HTTP_CACHE, 'socket_test.cfg'));
    return;
});

app.get('/resources/*resource', async (req, res) => {
    let parts = req.url.split('?rand=');
    let [request, rand] = parts;

    if (request.match(/([\\:?*"<>|]|\.{2})+/)) {
        res.sendStatus(500);
    }

    let absolute_path = path.join(CUSTOM_HTTP_CACHE, request);
    let exists = fs.existsSync(absolute_path);

    if (!exists || !config.HttpServer.ServeCache) { // if the cached file doesn't exist or we don't wanna serve cache, download resource.
        let url = remote_full + request + (rand ? '?rand=' + rand : '');
        if (config.Logger.Verbose) {
            logger.Log(`* Fetching ${url}...`);
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
            console.log(`* Serving ${absolute_path}`);
        }
        res.sendFile(absolute_path);
    }
});

app.listen(config.HttpServer.LocalPort, config.HttpServer.LocalHostName, () => {
    logger.Log(`* HttpServer Mirroring ${hosted_full} -> ${remote_full}.`);
});