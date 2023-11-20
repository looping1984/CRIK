import * as jsrl from "readline";

type _stAsk = {
    ask: string;
    callback: (input: string) => any;
}

/**
 * 一个小巧简单的控制台输入监控
 * 因为没有找到node.js里好用的控制台
 */
export class crConsole {
    private _waits: _stAsk[];
    private _current: _stAsk;
    private _rl: jsrl.Interface;
    private _suspend: boolean;
    constructor() {
        this._waits = [];
    }
    /**
     * 关联输入流
     */
    open(reader: jsrl.Interface) {
        this._rl = reader;
        reader.on('line', (input) => {
            if (this._current) {
                if (!this._suspend) {
                    let cb = this._current.callback;
                    this._current = undefined;
                    cb(input);
                }
            }
            this._trySelect();
        });
    }
    /**
     * 关闭输入流
     */
    close() {
        if (this._rl) {
            this._rl.close();
        }
    }
    /**
     * 挂起
     */
    suspend() {
        if (!this._suspend) {
            this._suspend = true;
        }
    }
    /**
     * 恢复
     */
    resume() {
        if (this._suspend) {
            this._suspend = false;
            this._trySelect();
        }
    }
    /**
     * 等待一次输入
     */
    question(ask: string, resume: boolean, callback?: (input: string) => any) {
        if (callback) {
            this._waits.push({
                ask: ask || '',
                callback: callback,
            });
        }
        if (resume) {
            this._suspend = false;
        }
        this._trySelect();
    }

    private _trySelect() {
        if (this._current || this._suspend || this._waits.length === 0) {
            return;
        }
        this._current = this._waits[this._waits.length - 1];
        this._waits.splice(this._waits.length - 1, 1);
        process.stdout.write(this._current.ask);
    }
}