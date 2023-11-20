import { crExeCmd } from "./crExeCmd";
import { crExeHelp, crWorkStation } from "./crWorkstation";

/**
 * 控制台自带的系统指令
 */
export class crSystemExe {
    static exit(input: crExeCmd) {
        input.goon = false;
    }
    static help(exeCmd: crExeCmd, station: crWorkStation) {
        if (exeCmd.arg) {
            let help = station.getCmdHelp(exeCmd.arg);
            if (!help) {
                console.log('未知指令: ' + exeCmd.arg);
                console.log('使用 help 查阅有效指令列表');
                return;
            }
            station.printCmdHelp(help);
        } else {
            console.log('当前版本工具所有指令列表');
            let helps = station.cmdHelps;
            for (let exec in helps) {
                let help = helps[exec];
                let title = help.title;
                console.log('● ' + exec + ': ' + title);
            }
            console.log('使用 help <exec_name> 查阅具体指令的详细用法');
        }
    }

    static get man_helps(): Record<string, crExeHelp> {
        return {
            help: {
                title: '帮助指令',
                grammar: 'help [<exec_name>]',
                params: ['exec_name: 待显示详细信息的指令名称'],
                desc: '不带参数则显示当前所有指令列表',
                _exec_: crSystemExe.help,
            },
            exit: {
                title: '退出指令',
                grammar: 'exit',
                desc: '直接退出整个控制台',
                _exec_: crSystemExe.exit,
            }
        };
    }
}