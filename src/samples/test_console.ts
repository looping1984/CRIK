import { crExeCmd, crFS, crJs2Json, crJson2TSTyping, crPath, crSensitiveScanner, crUtil, crWorkStation, IJ2CSParseInfo, not_null } from "..";
import { crTSCircularBreaker } from "../AST/crTSCircularBreaker";
import { crTSMonoParser } from "../AST/crTSMonoParser";
import { crTSReader } from "../AST/crTSReader";
import { crJson2CSDefine } from "../crJson2CSDefine";
import { crXlsx2TS } from "../crXlsx2TS";

/**
 * js转ts声明和json测试
 */
function test_js2tsjson() {
    let jsonRet = crJs2Json.scanFolder('./cfg_test/');
    if (jsonRet.error) {
        console.error(jsonRet.error);
    } else {
        crFS.write_json('./cfg_test.json', jsonRet.jobjects, true);
        let types = crJson2TSTyping.genTypes(jsonRet.jobjects, 'TestCfg');
        crFS.write_text('./TestCfg.ts', types);
    }
}

function test_js2csjson() {
    let hookFunc = function (ps: IJ2CSParseInfo) {
        let target = ps.target;
        if (crUtil.isObject(target)) {
            let keys = Object.keys(target);
            if (keys.length >= 2 && keys.length <= 3) {
                let c = 0;
                if (not_null(target['x'])) { c += 1; }
                if (not_null(target['y'])) { c += 1; }
                if (not_null(target['z'])) { c += 1; }
                if (c >= 2) {
                    return { replace: 'Vec3' };
                }
            }
        }
        return undefined;
    };

    let cfgName = 'ActivityFireworkCfg'
    let jsonRet = crJs2Json.parseSource(crFS.read_text(`./local/${cfgName}.js`));
    if (jsonRet.error) {
        console.error(jsonRet.error);
    } else {
        let jobject = jsonRet.jobjects[Object.keys(jsonRet.jobjects)[0]];
        let types = crJson2CSDefine.generate(jobject, cfgName, {
            typeNameOfAny: 'IJsonObject',
            typeNameOfList: 'CfgList',
            typeNameOfStringMap: 'CfgDictionary',
            parseHook: hookFunc,
        });
        if (types.error) {
            console.error(types.error);
        } else {
            crFS.write_text('./local/out/test.cs', types.code);
        }
    }
}

/**
 * 测试迷你控制台
 */
function test_crik_console() {
    let work = new crWorkStation();

    //敏感词扫描
    work.regCmdHelp('banshu_scan', {
        title: '版署敏感词扫描',
        grammar: 'banshu_scan <path> [-o <out-path>] [-i <ignore-node> [<ignore-node1> [<...]',
        params: [
            '   path: 待扫描的js配置文件夹',
            '   -o: 扫描结果输出文件路径，可选，默认控制台输出',
            '   -i: 需要忽略的第一级根节点，可选；多个根节点以空格隔开'
        ],
        desc: '比如这样使用： banshu_scan "E:\\IdleAnt\\config\\Cfgs" -o sensitive.txt -i Tables FUICfg CustomComps',
    });
    work.regCmdExecuter('banshu_scan', exec_banshu_scan);

    work.regCmdHelp('ast', {
        title: 'ast',
        grammar: 'ast <path>',
        params: [
            '    path: 待扫描抽象语法树的文件路径',
        ],
        desc: '扫描抽象语法树',
        _exec_: exec_ast,
    });

    work.regCmdHelp('js2cs', {
        title: 'js->c#',
        grammar: 'js2cs',
        params: [
        ],
        desc: '扫描js配置，自动生成cs',
        _exec_: exec_js2cs,
    });

    work.regCmdHelp('ts.lu', {
        title: 'ts circular breaker',
        grammar: 'ts.lu',
        desc: '循环依赖处理',
        _exec_: exec_circular_break,
    });

    work.regCmdHelp('ts.imports', {
        title: 'ts.imports',
        grammar: 'ts.imports <path>',
        desc: '将ts源码的imports内容移到最顶上',
        _exec_: exec_ts_imports,
    });

    work.regCmdHelp('x2ts', {
        title: 'excel to ts',
        grammar: 'x2ts',
        desc: 'excel 转为 json 和 Typescript typing',
        _exec_: exec_xlsx2ts,
    });

    //启动控制台
    work.launch();
}


function exec_circular_break(exeCmd: crExeCmd, station: crWorkStation) {
    let root = 'E:\\IdleAnt\\assets\\Script\\Client';
    crTSCircularBreaker.circularBreakFolder(root, crPath.join(root, 'ts_predefines.d.ts'), crPath.join(root, 'Entry.ts'), {
        distIndexJSPath: 'preview-scripts/assets/Script/Client/ts_predefines.js',
        relativeIndexTSPath: 'Script\\Client\\ts_predefines.d.ts',
    });
}


function exec_js2cs(exeCmd: crExeCmd, station: crWorkStation) {
    test_js2csjson();
}

function exec_ast(exeCmd: crExeCmd, station: crWorkStation) {
    let tspath = exeCmd.object;
    if (!tspath) {
        tspath = './local/TSDataComp.ts';
        // station.printCmdHelp(exeCmd.name);
        // return;
    }
    let tsRoot = crPath.standardize(crPath.currentDirectory, true);
    let tsinfo = crTSMonoParser.parse(tsRoot, tspath);
    crFS.write_json('./local/tsinfo.json', tsinfo, true);
}

function exec_banshu_scan(exeCmd: crExeCmd, station: crWorkStation) {
    let jsroot = exeCmd.object;
    if (!jsroot) {
        station.printCmdHelp(exeCmd.name);
        return;
    }
    let outpath = exeCmd.getParam('-o');
    let outlines: string[];
    let console_log: any;
    if (outpath) {
        outlines = [];
        console_log = console.log;
        console.log = (...args) => {
            outlines.push(args.join(' '));
        };
    }
    let jsonRet = crJs2Json.scanFolder(jsroot);
    if (jsonRet.error) {
        console.error(jsonRet.error);
    } else {
        let ignores = exeCmd.getParams('-i');
        if (ignores) {
            for (let ig of ignores) {
                delete jsonRet.jobjects[ig];
            }
        }
        let snum = crSensitiveScanner.scanJObject(jsonRet.jobjects);
        console.log('[Sensitive Num]', snum);
    }
    if (outpath) {
        console.log = console_log;
        crFS.write_text(outpath, outlines.join('\n'));
    }
}

function exec_ts_imports(exeCmd: crExeCmd, station: crWorkStation) {
    let tsRoot = exeCmd.object;
    if (!tsRoot) {
        console.error('请输入路径');
        return;
    }
    tsRoot = crPath.standardize(tsRoot, true);
    let tsPaths: string[] = [];
    if (crPath.isDir(tsRoot)) {
        crPath.collectGoodFiles(tsRoot, '.ts', true, false, tsPaths);
    } else {
        tsPaths.push(tsRoot);
    }
    for (let tsPath of tsPaths) {
        if (!crTSReader.swinImports(tsPath)) {
            console.error('ts swin imports failed:', tsPath);
            return false;
        }
    }
}

function exec_xlsx2ts(exeCmd: crExeCmd, station: crWorkStation) {
    crXlsx2TS.transform({
        excel: 'res/cfg_test/',
        outJson: 'res/cfg_test/cfg.json',
        outTyping: 'res/cfg_test/auto_cfg/',
        clearOldTypings: true,
    });
}

//test_js2csjson();
test_crik_console();