import express from 'express'
import fs from 'node:fs';
import { MIMEType } from 'node:util';
import path from 'path';

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

type $config = {
    "Debug": boolean, // idk
    "StoreCache": boolean,
    "ServeCache": boolean,
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
        "Protocol": 'http'/*  | 'https' | 'ftp', */
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
    logger.Log(`Storing Cache:\t\t${config.StoreCache}`, false);
    logger.Log(`Serving Cache:\t\t${config.ServeCache}`, false);
    logger.Log('', false);
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

// async function GetResource(url: string, is_web: boolean, _config?: $config): Promise<string | null> {
//     // I have no clue what I'm doing bro
//     // Array buffers ain't work figure this shit out
//     _config ??= config;
//     if (is_web) {
//         let webpath = _config.resource_url[_config.mode];
//         console.log(`Forwarding to ${webpath + url}`);
//         try {
//             let resource = (await (await fetch(webpath + url)).text());
//             return resource
//         } catch (e) {
//             console.log(e);
//             return null;
//         }
//     } else {
//         let filepath = path.join(_config.resource_url[_config.mode], url.split('?')[0]);
//         if (fs.existsSync(filepath) && !fs.statSync(filepath).isDirectory()) {
//             let file = fs.readFileSync(filepath, 'utf8');
//             return file;
//         } else {
//             return null;
//         }
//     }
// }

app.get('/resources/*resource', async (req, res) => {
    let parts = req.url.split('?rand=');
    let [filepath, rand] = parts;
    console.log(path.join(import.meta.dirname, 'www', filepath));
    // if protocol is not http or https, or origin is null, then its a local path maybe
    // switch mode, direct to downloaded resources/otgithub if "modern", otherwise, forward to real resources server

    // sanitize directory traversal
    // if serve cache, check for cache, return
    // if store cache, request from server, return
    // handle accordingly for missing files in the event store is off and file doesnt exist
});

app.listen(config.HttpServer.LocalPort, config.HttpServer.LocalHostName, () => {
    logger.Log(`* HttpServer Mirroring ${hosted_full} -> ${remote_full}.`);
});