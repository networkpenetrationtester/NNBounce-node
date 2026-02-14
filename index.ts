import express from 'express'
import fs from 'node:fs';
import path from 'path';
import axios from 'axios';

const app = express();

interface Logger$Options {
    info?: boolean,
    warn?: boolean,
    error?: boolean
}

class Logger {
    private usefile;
    private filename;
    private filepath;
    private tag;
    private options: Logger$Options;

    constructor(usefile: boolean, options?: Logger$Options, tag: string = 'NNBounce') {
        this.options = options ?? {};
        this.options.info ??= true, this.options.warn ??= true, this.options.error ??= true;
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
        let time_string = `[${date.toTimeString().split(' ')[0]}]`;
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

    LogTimed(data: any, prefix = '') {
        this.Log(data, true, prefix);
    }

    Log(data: any, timestamp = false, prefix = '') {
        let line = typeof data === 'object' ? JSON.stringify(data) : data.toString();
        prefix && (line = prefix + ' ' + line);
        timestamp && (line = this.TimeStamp(line));
        if (this.usefile) {
            this.LogFile(line);
        } else {
            console.log(line);
        }
    }

    LogCustom = (data: any, prefix: string) => this.Log(data, false, prefix);
    Info = (data: any) => this.options.info && this.LogCustom(data, 'ℹ ');
    Warn = (data: any) => this.options.warn && this.LogCustom(data, '🚨');
    Error = (data: any) => this.options.error && this.LogCustom(data, '💥');

    LogCustomTimed = (data: any, prefix: string) => this.LogTimed(data, prefix);
    InfoTimed = (data: any) => this.options.info && this.LogCustomTimed(data, 'ℹ ');
    WarnTimed = (data: any) => this.options.warn && this.LogCustomTimed(data, '🚨');
    ErrorTimed = (data: any) => this.options.error && this.LogCustomTimed(data, '💥');
}

type $config = {
    "Logger": {
        "Requests": boolean, // log HTTP requests
        "Responses": boolean, // log HTTP responses
        "Info": boolean, // log info (verbose)
        "Warn": boolean,
        "Error": boolean, // log various errors
        "LogFile": boolean, // output log to a file in ./logs
    },
    "HttpServer": {
        "StaticPaths"?: string[], // optionally specify files or entire directories to blacklist from all non-read activities (do not specify leading /)
        "OverrideCachePath"?: string, // optionally redirect cache (except for static files) to another folder (null for ./www)
        "DirectoryBrowser"?: boolean, // primitive cache filebrowser
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

const ConfigLoader = () => {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        console.error(e);
        console.log(`* ERROR: ${CONFIG_PATH} failed to load! Proceeding with defaults...`);
        return {
            "Logger": {
                "Responses": true,
                "Requests": true,
                "Info": true,
                "Warn": true,
                "Error": true,
                "LogFile": false
            },
            "HttpServer": {
                "StaticPaths": [],
                "OverrideCachePath": null,
                "DirectoryBrowser": false,
                "LocalHostName": "localhost",
                "LocalPort": "8080",
                "Protocol": "http",
                "RewriteCache": false,
                "ServeCache": true,
                "WriteCache": true
            },
            "Bouncer": {
                "Enabled": true,
                "RemoteHostname": "example.org",
                "RemotePort": 443,
                "Protocol": "https"
            }
        };
    }
}

const RequestLogger: express.RequestHandler = (req, res, next) => {
    let strings = [
        req.ips.length > 0 ? `[${req.ips.join(', ')}]` : req.ip,
        req.method,
        req.url,
        req.body
    ];
    !req.body && strings.pop(); // ELITE TRICKERY!
    logger.LogCustomTimed(strings.join(' '), '📲');
    return next();
}

const FileInfo = (path: string) => { // returns array to be used as tuple
    let exists = fs.existsSync(path);
    let is_directory = exists && fs.statSync(path).isDirectory();
    return [exists, is_directory];
}

const DirectoryBrowser = (real_path: string, web_path: string, checked: boolean = false): string => { // generate barebones html file browser
    if (checked || (fs.existsSync(real_path) && fs.statSync(real_path).isDirectory())) {
        let children = ['..', ...fs.readdirSync(real_path)];
        let links = children.map((child) => {
            return [
                '<div>',
                /**/`<a href="${path.join('/', web_path, child)}">${child}</a>`,
                '</div>'
            ].join('\n');
        });
        return [
            '<!DOCTYPE html>',
            '<html>',
            /**/'<head>',
            /******/'<title>NNBounce File Browser</title>',
            /**/'</head>',
            /**/'<style>',
            /******/'a { color: #00ffff; }',
            /**/'</style>',
            /**/'<body style="background: #000000">',
            /******/...links,
            /**/'</body>',
            '</html>'
        ].join('\n');
    } else return 'h';
}

async function GetData(url: string) {
    return await axios.get(url) // HAS to be array buffer, otherwise won't save to cache properly...
        .then((result) => {
            config.Logger.Info && logger.LogTimed(`🐕 Fetching: ${url}`);
            return result.data;
        }).catch((e) => {
            // res.sendStatus(e.status);
            logger.ErrorTimed([e.status, e.code].join(' '));
            return null;
        });
}

async function GetBuffer(url: string) {
    return await axios.get(url, { responseType: 'arraybuffer' }) // HAS to be array buffer, otherwise won't save to cache properly...
        .then((result) => {
            config.Logger.Info && logger.LogTimed(`🐕 Fetching: ${url}`);
            let buffer = Buffer.from(result.data);
            return buffer;
        }).catch((e) => {
            // res.sendStatus(e.status);
            logger.ErrorTimed([e.status, e.code].join(' '));
            return null;
        });
}

const DIR = import.meta.dirname;
const HTTP_CACHE_PATH = path.join(DIR, 'www');
const LOG_PATH = path.join(DIR, 'logs');
const CONFIG_PATH = path.join(DIR, 'config.json');
const config: $config = ConfigLoader();
const logger = new Logger(config.Logger.LogFile, { info: config.Logger.Info, warn: config.Logger.Warn, error: config.Logger.Error });
const OVERRIDE_CACHE_PATH = config.HttpServer.OverrideCachePath ?? HTTP_CACHE_PATH; // defaults to full ./www path
const REMOTE_ENDPOINT = `${config.Bouncer.Protocol}://${config.Bouncer.RemoteHostname}:${config.Bouncer.RemotePort}`;
const HOSTED_ENDPOINT = `${config.HttpServer.Protocol}://${config.HttpServer.LocalHostName ?? '*'}:${config.HttpServer.LocalPort}`; // defaults to binding all interfaces, indicate this

if (!fs.existsSync(HTTP_CACHE_PATH)) { // maybe in the future add a config option to deploy this in multiple directories
    fs.mkdirSync(HTTP_CACHE_PATH);
    logger.LogCustom(`Created www directory: ${HTTP_CACHE_PATH}`, '📂');
}

if (!fs.existsSync(LOG_PATH)) { // maybe in the future add a config option to deploy this in multiple directories
    fs.mkdirSync(LOG_PATH);
    logger.LogCustom(`Created logs directory: ${LOG_PATH}`, '📂');
}

logger.LogCustom(`Program Started @ ${logger.CustomDate()}`, '⏰');
logger.Info(`Remote Endpoint:\t${REMOTE_ENDPOINT}`);
logger.Info(`Hosted Endpoint: \t${HOSTED_ENDPOINT}`);
logger.Info(`Cache Path: \t\t${OVERRIDE_CACHE_PATH}`);
logger.Info(`Directory Browser:\t${config.HttpServer.DirectoryBrowser ? 'enabled' : 'disabled'}`);
logger.Info(`Bouncer:\t\t${config.Bouncer.Enabled ? 'enabled' : 'disabled'}`);
logger.Info(`Writing Cache:\t${config.HttpServer.WriteCache ? 'enabled' : 'disabled'}`);
logger.Info(`Rewriting Cache:\t${config.HttpServer.RewriteCache ? 'enabled' : 'disabled'}`);
logger.Info(`Serving Cache:\t${config.HttpServer.ServeCache ? 'enabled' : 'disabled'}`);
logger.Log('');

config.Logger.Requests && app.use(RequestLogger);

// possible future implementation: atob(REMOTE_ENDPOINT) -> into its own folder in www?
// I have discovered that this program can also function as a web scraper.

app.get('/', async (req, res) => { // override root with cache viewer?
    if (config.HttpServer.DirectoryBrowser) {
        res.send(DirectoryBrowser(OVERRIDE_CACHE_PATH, '/')); // send root folder hierarchy if DirectoryBrowser enabled.
        config.Logger.Responses && logger.LogCustomTimed(`Serving directory browser: ${OVERRIDE_CACHE_PATH}`, '📁');
        return;
    } else {
        let data = await GetData(REMOTE_ENDPOINT);
        fs.writeFileSync(path.join(OVERRIDE_CACHE_PATH, 'index.html'), data);
        res.send(data);
        config.Logger.Responses && logger.LogCustomTimed(`Serving buffered: ${REMOTE_ENDPOINT}`, '👻');
        return;
    }
});

if (config.HttpServer.StaticPaths) {
    config.HttpServer.StaticPaths.length > 0 && config.Logger.Info && logger.LogCustom('These paths will be statically served:', '🔒');
    for (let p of config.HttpServer.StaticPaths) {
        let full_p = path.join(HTTP_CACHE_PATH, p);
        let [exists_outer, is_directory_outer] = FileInfo(full_p);
        exists_outer ? logger.Info(`Path will remain local & unmodified: ${p}`) : logger.Warn(`Path doesn't exist, will return 404: ${p}`);
        let file_or_all_children = `/${p}${is_directory_outer ? '/*resource' : ''}`;
        if (exists_outer) {
            app.get(file_or_all_children, (req, res) => {
                let [resource, querystring] = req.url.split('?');
                let full_p = path.join(HTTP_CACHE_PATH, resource);
                let [exists_inner, is_directory_inner] = FileInfo(full_p);
                if (exists_inner) {
                    if (is_directory_inner) {
                        config.HttpServer.DirectoryBrowser ? res.send(DirectoryBrowser(full_p, resource, true)) : res.sendStatus(403);
                        config.HttpServer.DirectoryBrowser ? config.Logger.Responses && logger.LogCustomTimed(`Serving directory browser: ${full_p}`, '📁') : logger.WarnTimed(`Directory browser is off [403]`);
                        return;
                    }
                    else {
                        res.sendFile(full_p);
                        config.Logger.Responses && logger.LogCustomTimed(`Serving cached: ${full_p}`, '💿')
                        return;
                    }
                } else {
                    res.sendStatus(404);
                    config.Logger.Responses && logger.ErrorTimed(`No such path: ${full_p} [404]`);
                    return;
                }
            });
        } else {
            app.get(file_or_all_children, (req, res) => {
                res.sendStatus(500);
                config.Logger.Responses && logger.ErrorTimed(`Static path misconfigured: ${full_p} [500]`);
                return;
            });
        }
    }
    logger.Log('');
}

app.get('/*resource', async (req, res) => {
    try {
        let parts = req.url.split('?');
        let [resource, querystring] = parts;
        let absolute_path = path.join(OVERRIDE_CACHE_PATH, resource);
        let [exists, is_directory] = FileInfo(absolute_path);
        if (is_directory) { // depends on 'exist' to be true
            config.HttpServer.DirectoryBrowser ? res.send(DirectoryBrowser(absolute_path, req.url, true)) : res.sendStatus(403);
            config.HttpServer.DirectoryBrowser ? config.Logger.Responses && logger.LogCustomTimed(`Serving directory browser: ${absolute_path}`, '📁') : logger.WarnTimed(`Directory browser is off [403]`);
            return;
        }
        let remote_url = REMOTE_ENDPOINT + resource + (querystring ? '?' + querystring : '');
        let init_write = !exists && config.HttpServer.WriteCache;
        let re_write = exists && config.HttpServer.RewriteCache;
        if (init_write || re_write) { // write cache
            if (config.Bouncer.Enabled) {
                let buffer = await GetBuffer(remote_url);
                if (buffer instanceof Buffer) {
                    let absolute_path_parent = path.dirname(absolute_path);
                    if (!fs.existsSync(absolute_path_parent)) fs.mkdirSync(absolute_path_parent, { recursive: true });
                    fs.writeFileSync(absolute_path, buffer);
                    config.Logger.Info && init_write && logger.LogCustomTimed(`Initial write of ${absolute_path}`, '🔽');
                    config.Logger.Info && re_write && logger.LogCustomTimed(`Re-write of ${absolute_path}`, '⏬');
                    res.type(path.extname(absolute_path));
                    res.send(buffer);
                    config.Logger.Responses && logger.LogCustomTimed(`Serving buffered ${absolute_path}`, '👻');
                    return;
                }
            }
            res.sendStatus(503);
            return;
        } else if (exists && config.HttpServer.ServeCache) { // serve cache
            config.Logger.Responses && logger.LogCustomTimed(`Serving cached ${absolute_path}`, '💿');
            res.sendFile(absolute_path); // automatically sets response type.
            return;
        } else if (config.Bouncer.Enabled) { // resort to buffering
            let buffer = await GetBuffer(remote_url);
            if (buffer instanceof Buffer) {
                res.send(buffer);
                config.Logger.Responses && logger.LogCustomTimed(`Serving buffered ${absolute_path}`, '👻');
                return;
            }
            res.sendStatus(503);
        } else {
            res.send(503); // you're out of luck
        }
    } catch (e) {
        console.error(e);
        res.send(500);
    }
});

let message = `🌐 HttpServer ${config.Bouncer.Enabled ? 'Proxying' : 'Running'}: ${HOSTED_ENDPOINT}${config.Bouncer.Enabled ? ' -> ' + REMOTE_ENDPOINT : ''}\n`;

if (config.HttpServer.LocalHostName) {
    app.listen(config.HttpServer.LocalPort, config.HttpServer.LocalHostName, () => {
        logger.LogTimed(message);
    });
} else {
    app.listen(config.HttpServer.LocalPort, () => {
        logger.LogTimed(message);
    });
}