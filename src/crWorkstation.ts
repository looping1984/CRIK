import { createInterface } from "readline";
import { crConsole } from "./crConsole";
import { crExeCmd } from "./crExeCmd";
import { crSystemExe } from "./crSystemExe";
import { crUtil } from "./crUtil";

export interface crCmdExecuteFunction {
    (exeCmd: crExeCmd, station: crWorkStation): any;
}

/**
 * 指令帮助信息格式
 */
export interface crExeHelp {
    /**
     * 指令名称，可选（在注册的时候会自动填上去）
     */
    cmdName?: string;
    /**
     * 指令的title（中文名称）
     */
    readonly title: string;
    /**
     * 指令的基本语法
     */
    readonly grammar: string;
    /**
     * 参数列表说明（包括object说明），可选
     */
    readonly params?: string[]
    /**
     * 更多描述，可选
     */
    readonly desc?: string;
    /**
     * 指令执行函数，可选
     */
    readonly _exec_?: crCmdExecuteFunction;
}

/**
 * 一个集成控制台
 * 1. 交互控制台，用户可在控制台中端输入相关命令
 * 2. 外部直接调用execute执行一个指令并结束
 * @example 
 * let work = new crWorkStation();
 * work.launch();
 * work.regCmdExecuter('my_cmd_name', (cmd)=>{
 *     let obj = cmd.object;
 *     let param = cmd.getParam('-someParam');
 *     //do something
 * });
 */
export class crWorkStation {
    private _console: crConsole;
    private _execes: Record<string, crCmdExecuteFunction>;
    private _helps: Record<string, crExeHelp>;
    constructor(setupDefaultExe?: boolean) {
        this._execes = {};
        this._helps = {};
        if (setupDefaultExe !== false) {
            this.regCmdHelps(crSystemExe.man_helps);
        }
    }
    /**
     * 直接执行一段命令行
     * @param cmdline 命令行，多行表示多个指令
     * @returns 返回指令执行结果，0表示正常，-1表示异常
     * @description 未来应该支持Promise异步的方式，以支持更多异步的指令
     */
    execute(cmdline: string): number {
        if (!cmdline) {
            return this.launch();
        }
        let cmds = cmdline.split('\n');
        for (let cmd of cmds) {
            cmd = cmd.trim();
            if (!cmd) {
                continue;
            }
            let exeCmd = new crExeCmd(cmd);
            if (!exeCmd.name) {
                console.log('输入格式不正确', cmd);
                return 1;
            }
            this._executeCmd(exeCmd);
            if (exeCmd.ret !== 0) {
                return exeCmd.ret;
            }
        }
        return 0;
    }
    /**
     * 启动指令集成控制台
     * @param welcome 欢迎语，可选
     * @returns 0
     */
    launch(welcome?: string) {
        welcome || (welcome = '欢迎使用Crik迷你控制台\n');
        console.log(welcome);
        this.execute('help');
        this._console = new crConsole();
        this._console.open(createInterface({ input: process.stdin, output: process.stdout }));
        this._proccess_input(undefined);
        return 0;
    }
    /**
     * 注册一个指令执行函数
     * @param cmdName 指令名称
     * @param execute 执行函数
     * @param help 顺便注册帮助信息，可选
     */
    regCmdExecuter(cmdName: string, execute: crCmdExecuteFunction, help?: crExeHelp) {
        if (execute) {
            this._execes[cmdName] = execute;
        } else {
            delete this._execes[cmdName];
        }
        if (help) {
            this._helps[cmdName] = help;
        }
    }
    /**
     * 注册一个指令的帮助信息
     * @param cmdName 指令名称
     * @param help 帮助信息
     * @description 注意，help._exec_如果有值，说明在注册帮助信息的同时顺便注册指令执行函数
     */
    regCmdHelp(cmdName: string, help: crExeHelp) {
        help.cmdName = cmdName;
        this._helps[cmdName] = help;
        help._exec_ && this.regCmdExecuter(cmdName, help._exec_);
    }
    /**
     * 注册一波指令帮助信息
     * @param helps 指令帮助信息集合
     */
    regCmdHelps(helps: Record<string, crExeHelp>) {
        for (let name in helps) {
            let help = helps[name];
            if (help.title && help.grammar) {
                help.cmdName = name;
                this.regCmdHelp(name, help);
            }
        }
    }
    /**
     * 获取给定的指令帮助信息
     * @param cmdName 指令名称
     * @returns 帮助信息，没有就返回undefined
     */
    getCmdHelp(cmdName: string) {
        return this._helps[cmdName];
    }
    /**
     * 打印给定的指令帮助信息
     * @param nameOrHelp 指令名称或者它的帮助信息
     */
    printCmdHelp(nameOrHelp: string | crExeHelp) {
        let help: crExeHelp;
        if (typeof nameOrHelp === 'string') {
            help = this.getCmdHelp(nameOrHelp);
        } else {
            help = nameOrHelp;
        }
        if (help) {
            let title = help.title;
            let grammer = help.grammar;
            console.log('● ' + help.cmdName + ': ' + title);
            console.log(grammer);
            if (help.params) {
                for (let i = 0; i < help.params.length; ++i) {
                    console.log(help.params[i]);
                }
            }
            if (help.desc) {
                console.log(help.desc);
            }
        } else if (nameOrHelp) {
            console.log(`cmd not found: ${nameOrHelp}`);
        }
    }
    /**
     * 所有的指令帮助信息
     */
    get cmdHelps() {
        return crUtil.toReadonly(this._helps);
    }

    private _proccess_input(inputStr: string) {
        let exeCmd = new crExeCmd(inputStr);
        if (!exeCmd.name) {
            this._console.question('\n> ', false, this._proccess_input.bind(this));
            return;
        }
        this._executeCmd(exeCmd);
        if (exeCmd.goon) {
            this._console.question('\n> ', false, this._proccess_input.bind(this));
        } else {
            this._console.close();
        }
    }
    private _executeCmd(exeCmd: crExeCmd) {
        let cmd = exeCmd.name;
        let exec: crCmdExecuteFunction;
        for (let key in this._execes) {
            let f = this._execes[key];
            key = key.toLowerCase();
            let c = cmd.toLowerCase();
            if (c === key) {
                exec = f;
                break;
            }
            let idx1 = key.lastIndexOf('*');
            if (idx1 === -1) {
                continue;
            }
            let pre = key.substr(0, idx1);
            if (c.indexOf(pre) === 0) {
                exec = f;
                break;
            }
        }
        if (exec) {
            exec(exeCmd, this);
        }
        else {
            console.log('未知指令。请输入help查看所有指令');
        }
    }
}