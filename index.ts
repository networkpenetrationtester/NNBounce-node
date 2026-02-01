import express from 'express'
import fs from 'node:fs';
import { MIMEType } from 'node:util';
import path from 'path';
import axios from 'axios';

const app = express();
const dir = import.meta.dirname;

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
    "Debug": boolean, // idk
    "Logger": {
        "Requests": boolean,
        "Verbose": boolean,
        "LogFile": boolean,
        "Offset": number //udk
    },
    "HttpServer": {
        "Enabled": boolean, // idk
        "LocalHostName": string,
        "LocalPort": number,
        "Protocol": 'http'/*  | 'https' | 'ftp', */,
        "StoreCache": boolean,
        "ServeCache": boolean,
        "OverwriteCache": boolean,
    },
    "Bouncer": {
        "Enabled": boolean,
        "RemoteHostname": string,
        "RemotePort": number,
        "Protocol": 'http' | 'https' | 'ftp',
    }
}

const config: $config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

let logger = new Logger(true, false);
let remote_full = `${config.Bouncer.Protocol}://${config.Bouncer.RemoteHostname}:${config.Bouncer.RemotePort}`;
let hosted_full = `${config.HttpServer.Protocol}://${config.HttpServer.LocalHostName}:${config.HttpServer.LocalPort}`;

if (config.Logger.Verbose) {
    logger.Log(`* Program Started @ ${logger.CustomDate()}`, false);
    if (config.Bouncer.Enabled) logger.Log(`Remote Endpoint:\t${remote_full}`, false);
    if (config.HttpServer.Enabled) logger.Log(`Hosted Endpoint: \t${hosted_full}`, false);
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
    res.sendFile(path.join(dir, 'www', 'Prelauncher.swf'));
    return;
});

app.get('/Loader.swf', (req, res) => {
    res.sendFile(path.join(dir, 'www', 'Loader.swf'));
    return;
});

app.get('/socket_test.cfg', (req, res) => {
    res.sendFile(path.join(dir, 'www', 'socket_test.cfg'));
    return;
});

app.get('/resources/*resource', async (req, res) => {
    let parts = req.url.split('?rand=');
    let [request, rand] = parts;

    if (request.match(/([\\:?*"<>|]|\.{2})+/)) {
        res.sendStatus(500);
    }

    let absolute_path = path.join(import.meta.dirname, 'www', request);
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
                return;
            })
            .catch((e) => {
                console.error(e);
                res.sendStatus(500);
                return;
            });
    }

    if (exists && config.HttpServer.ServeCache) {
        res.sendFile(absolute_path);
        return;
    }
});

app.listen(config.HttpServer.LocalPort, config.HttpServer.LocalHostName, () => {
    logger.Log(`* HttpServer Mirroring ${hosted_full} -> ${remote_full}.`);
});