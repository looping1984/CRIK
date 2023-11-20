import { crUtil } from "./crUtil";

/**
 * 控制台指令
 * 包含指令名称、对象、参数等
 */
export class crExeCmd {
    private _cmd: string;
    private _arg: string;
    private _args: string[];
    /**
     * 构建一个控制台指令实例
     * @param inputStr 输入的指令字符串
     */
    constructor(inputStr: string) {
        this.goon = true;
        this.ret = 0;
        this._cmd = undefined;
        this._arg = undefined;
        this._args = undefined;
        if (!inputStr) {
            return;
        }
        let words = [];
        let meet: string;
        let begin = 0;
        let idx = 0;
        let rollOneWord = () => {
            let w = inputStr.substring(begin, idx).trim();
            w && words.push(w);
        };
        while (idx < inputStr.length) {
            let c = inputStr[idx];
            if (c === meet) {
                rollOneWord();
                begin = ++idx;
            } else if (meet) {
                ++idx;
            } else if (c === '"' || c === "'") {
                rollOneWord();
                begin = ++idx;
            } else if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
                rollOneWord();
                begin = ++idx;
            } else {
                ++idx;
            }
        }
        rollOneWord();
        if (words.length === 0) {
            return;
        }
        this._cmd = words[0];
        words.splice(0, 1);
        this._args = words;
        this._arg = words.length > 0 ? words[0] : undefined;
    }
    /**
     * 标志控制台是否继续接收下一个输入
     */
    goon: boolean;
    /**
     * 本次指令执行完毕后的返回值
     */
    ret: number;
    /**
     * 指令名称
     */
    get name() {
        return this._cmd;
    }
    /**
     * 指令名称之后的第一个输入参数
     */
    get arg() {
        return this._arg;
    }
    /**
     * 指令名称之后的所有输入参数
     */
    get args() {
        return this._args;
    }
    /**
     * 指令的执行对象，可能为空
     */
    get object() {
        return this.objects[0];
    }
    /**
     * 指令的执行对象列表，可能为空
     */
    get objects() {
        let objs = [];
        if (this._args) {
            for (let i = 0; i < this._args.length; ++i) {
                let a = this._args[i];
                if (this._is_paramName(a)) {
                    break;
                }
                objs.push(a);
            }
        }
        return objs;
    }
    /**
     * 判断是否有给定参数值
     * @param parName 参数名称，类似 '-path' 或者 'path'
     * @returns 是否有该参数对应的值
     */
    hasParam(parName: string) {
        return this._locate_param_index(parName) !== -1;
    }
    getParam(parName: string) {
        let idx = this._locate_param_index(parName);
        if (idx === -1 || idx === this._args.length - 1) {
            return undefined;
        }
        let a = this._args[idx + 1];
        if (this._is_paramName(a)) {
            return undefined;
        }
        return a;
    }
    getParamAsNum(parName: string, defVal?: number) {
        let str = this.getParam(parName);
        return crUtil.toNumber(str, defVal || 0);
    }
    getParams(parName: string) {
        let idx = this._locate_param_index(parName);
        if (idx === -1) {
            return undefined;
        }
        let pars = [];
        for (let i = idx + 1; i < this._args.length; ++i) {
            let a = this._args[i];
            if (this._is_paramName(a)) {
                break;
            }
            pars.push(a);
        }
        return pars;
    }
    private _is_paramName(a: string) {
        if (!a) {
            return false;
        }
        return a.charAt(0) === '-';
    }
    private _locate_param_index(parName: string) {
        if (!this._args || !parName) {
            return -1;
        }
        if (!this._is_paramName(parName)) {
            parName = '-' + parName;
        }
        parName = parName.toLowerCase();
        for (let i = 0; i < this._args.length; ++i) {
            let a = this._args[i];
            let la = a.toLowerCase();
            if (la === parName) {
                return i;
            }
        }
        return -1;
    };
}