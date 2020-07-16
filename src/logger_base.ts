/**
 * logger_base는 가능하면 다른 사용자 정의 모듈을 참조하지 않는게 좋습니다
 */

import moment from 'moment';
import winston from 'winston';
import winstonDaily from 'winston-daily-rotate-file';
import path from 'path';
import mkdirp from 'mkdirp';

const enum ELogLevel {
    Debug = 'debug',
    Info = 'info',
    Error = 'error',
}

//INFO: 필요한 로그 타입을 추가하면 됨
export const enum ELogType {
    Db = '[DB]',
}

const kMaxFileSize: number = 1024 * 1024 * 100; //100MB
const kNumMaxFiles: number = 100; //로그파일 최대 100개
const kFilename: string = 'MAM_%DATE%.log';
const kMaxFilenameLength: number = 20;
//INFO: 로그 저장 폴더
const kLogPath: string = path.join(process.cwd(), './logs');
//INFO: 프로젝트 최상위 폴더
const kProjRootPath: string = path.join(__dirname, '..');
const kLogLevelLong2ShortMap: Map<string, string> = new Map<string, string>();
kLogLevelLong2ShortMap.set('INFO', 'INF');
kLogLevelLong2ShortMap.set('DEBUG', 'DBG');
kLogLevelLong2ShortMap.set('WARN', 'WRN');
kLogLevelLong2ShortMap.set('ERROR', 'ERR');

class logger_base {
    private readonly writer: winston.Logger;

    constructor() {
        this.makeLoggerFolder();

        this.writer = this.getLogger();
    }

    private makeLoggerFolder() {
        try {
            mkdirp.sync(kLogPath);
        } catch (ex) {
            console.error(`Create logger path FAILED; ${ex.message}`);
            return;
        }

        console.info(`Create logger folder SUCCESS`);
    }

    private getTimeStampFormat(): string {
        return moment().format('YYYY-MM-DD HH:mm:ss.SSS ZZ').trim();
    }

    private getLogLevelString(info: winston.Logform.TransformableInfo): string {
        let levelStr: string = info.level.toUpperCase();
        if (kLogLevelLong2ShortMap.has(levelStr) === false) {
            return 'DBG';
        }
        return kLogLevelLong2ShortMap.get(levelStr) as string;
    }

    private getLogger() {
        if (this.writer !== undefined) {
            return this.writer;
        }

        return winston.createLogger({
            transports: [
                new winstonDaily({
                    filename: path.join(kLogPath, kFilename),
                    datePattern: 'YYYYMMDD',
                    level: ELogLevel.Debug,
                    maxSize: kMaxFileSize,
                    maxFiles: kNumMaxFiles,
                    format: winston.format.printf(info => `${this.getTimeStampFormat()} ${this.getLogLevelString(info)} ${info.message}`),
                    //tailable: true, //INFO: 최신 로그 파일의 이름이 항상 동일하게 유지됨 (직전 로그 파일은 가장 높은 번호의 파일)
                }),
                new winston.transports.Console({
                    level: ELogLevel.Debug,
                    format: winston.format.printf(info => `${this.getTimeStampFormat()} ${this.getLogLevelString(info)} ${info.message}`),
                }),
            ],
        });
    }

    public defaultDebug(str: string) {
        this.writer.debug(str);
    }

    public defaultError(str: string) {
        this.writer.error(str);
    }

    public info(logType: ELogType, ...args: any[]) {
        this.writer.info(`${this.getFileNameLine()} ${logType} ${this.getLogString(args)}`);
    }

    public warn(logType: ELogType, ...args: any[]) {
        this.writer.warn(`${this.getFileNameLine()} ${logType} ${this.getLogString(args)}`);
    }

    public error(logType: ELogType, ...args: any[]) {
        this.writer.error(`${this.getFileNameLine()} ${logType} ${this.getLogString(args)}`);
    }

    public debug(logType: ELogType, ...args: any[]) {
        this.writer.debug(`${this.getFileNameLine()} ${logType} ${this.getLogString(args)}`);
    }

    private createPaddingString(str: string, maxPaddingSize: number) {
        let padding = '';
        let addPaddingSize = maxPaddingSize - str.length;
        for (let i = 0; i < addPaddingSize; i++) {
            padding += ' ';
        }
        return `${padding}${str}`;
    }

    private getFuncName(): string {
        //WARN: 익명함수에서는 함수이름이 표출되지 않음!
        const obj = {};
        Error.captureStackTrace(obj, this.getFuncName);
        const stack: string = obj['stack'];
        const funcNameLine = stack.split('\n')[2];
        const funcNameStartPos = funcNameLine.indexOf('at ') + 3;
        const funcNameLastPos = funcNameLine.indexOf('(', funcNameStartPos) - 1;
        return funcNameLine.slice(funcNameStartPos, funcNameLastPos);
    }

    private getFileNameLine() {
        let stackInfo = this.getStackInfo(1);

        const kMaxRelativePathLength: number = 25;
        let relativePath = stackInfo.relativePath;
        if (relativePath.length > kMaxRelativePathLength) {
            relativePath = relativePath.substr(relativePath.length - kMaxRelativePathLength, kMaxRelativePathLength);
        }

        return `${this.createPaddingString(relativePath, kMaxRelativePathLength)} ${this.createPaddingString(stackInfo.line, 5)}`;
    }

    private getLogString(args: any[]) {
        var str = '';
        for (var i = 0; i < args.length; i++) {
            if (typeof args[i] == 'object') {
                args[i] = JSON.stringify(args[i]);
            }
            str += args[i] + '\t';
        }

        return str;
    }

    /**
     * Parses and returns info about the call stack at the given index.
     */
    private getStackInfo(stackIndex: number) {
        // get call stack, and analyze it
        // get all file, method, and line numbers
        let stacklist = new Error(undefined).stack?.split('\n').slice(3);

        // stack trace format:
        // http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
        // do not remove the regex expresses to outside of this method (due to a BUG in node.js)
        let stackReg = /at\s+(.*)\s+\((.*):(\d*):(\d*)\)/gi;
        let stackReg2 = /at\s+()(.*):(\d*):(\d*)/gi;

        let s = stacklist?.[stackIndex] || stacklist?.[0];
        if (s === undefined) {
            throw new Error();
        }
        s = s.toString();
        let sp = stackReg.exec(s) || stackReg2.exec(s);

        if (sp && sp.length === 5) {
            return {
                method: sp[1],
                relativePath: path.relative(kProjRootPath, sp[2]),
                line: sp[3],
                pos: sp[4],
                file: path.basename(sp[2]),
                stack: stacklist?.join('\n'),
            };
        }
    }
}

const logger: logger_base = new logger_base();
export default logger;
