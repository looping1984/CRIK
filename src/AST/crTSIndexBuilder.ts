import { crFS } from "../crFS";
import { AppendSlashType, crPath } from "../crPath";
import { crASTHelper } from "./crASTHelper";
import { crTSExportInfo, crTSExportParser } from "./crTSExportParser";

/**
 * 生成index.js需要的信息
 */
export type crJSIndexBuildOptions = {
    /**
     * index.js 的最终生成路径（绝对路径），可选。不填则根据outIndexTSPath自动计算
     */
    outIndexJSPath?: string;
    /**
     * 额外信息：index.js在运行时的路径（相对运行时的根路径，比如preview-scripts/assets/Script/Client/index.js）
     */
    distIndexJSPath: string;
    /**
     * 相对项目根路径的index.d.ts路径，比如 Script/Client/index.d.ts
     */
    relativeIndexTSPath: string;
};

/**
 * 生成index文件的参数 (index.d.ts和index.js)
 */
export type crTSIndexBuilderOptions = {
    /**
     * 整个游戏的ts代码导出对象列表（已按强依赖排序）
     */
    exports: crTSExportInfo[];
    /**
     * index.d.ts最终的输出路径，绝对路径，比如 E:/Work/MyGame/assets/src/Client/inde.d.ts
     */
    outIndexTSPath: string;
    /**
     * 输出 index.js 需要的信息，可选。不填则不生成 index.js
     */
    indexJS?: crJSIndexBuildOptions;
};

type Options = crTSIndexBuilderOptions & {
    /**
     * 用于计算relative import path的index文件的基准路径（已绝对化），比如 E:/Work/MyGame/assets/src/Client/
     */
    indexTSBase: string;
};

/**
 * index文件生成器 (index.d.ts and index.js)
 */
export abstract class crTSIndexBuilder {
    /**
     * 生成index typing 文件
     * @param buildOptions build参数
     * @returns 是否成功
     */
    static generate(buildOptions: crTSIndexBuilderOptions) {
        //options populate
        let options = buildOptions as Options;
        options.outIndexTSPath = crPath.standardize(options.outIndexTSPath, AppendSlashType.Never);
        options.indexTSBase = crPath.getParentFolder(options.outIndexTSPath);
        let indexJS = options.indexJS;
        if (indexJS) {
            indexJS.outIndexJSPath || (indexJS.outIndexJSPath = crPath.replaceExt2(options.outIndexTSPath, '.js'));
            indexJS.outIndexJSPath = crPath.standardize(indexJS.outIndexJSPath, AppendSlashType.Never);
            indexJS.distIndexJSPath = crPath.standardize(indexJS.distIndexJSPath, AppendSlashType.Never);
            indexJS.relativeIndexTSPath = crPath.standardize(indexJS.relativeIndexTSPath, AppendSlashType.Never);
        }

        //index.d.ts
        let content = crTSIndexBuilder._buildTSIndexContent(options);
        if (!crFS.write_text(options.outIndexTSPath, content, undefined, true)) {
            return false;
        }

        //index.js
        if (indexJS) {
            let content = crTSIndexBuilder._buildJSIndexContent(options);
            return crFS.write_text(indexJS.outIndexJSPath, content, undefined, true);
        }

        //success
        return true;
    }

    private static _buildTSIndexContent(options: Options) {
        let body = '';
        for (let info of options.exports) {
            if (info.exports.length === 0) {
                continue;
            }
            let reexportBody: string = undefined;
            for (let exp of info.exports) {
                reexportBody ? (reexportBody += ', ') : (reexportBody = '{ ');
                reexportBody += exp.isDefault ? `default as ${exp.name}` : exp.name;
            }
            if (reexportBody) {
                reexportBody += ' }';
                body && (body += '\n');
                body += c_TSExport.replace('{exportBody}', reexportBody).replace('{importPath}', crASTHelper.relativeImportPath(options.indexTSBase, info.tsPath));
            }
        }
        return `${c_TSFileHeader}\n${body}`;
    }

    /**
     * generate index.js content
     * @param options 
     * @returns soource content of index.js
     */
    private static _buildJSIndexContent(options: Options) {
        //header of js
        let header = c_JSFileHeader;
        header = header.replaceAll('{tsIndexPath}', options.indexJS.relativeIndexTSPath);
        header = header.replaceAll('{tsIndexFileName}', crPath.getFilename2(options.indexJS.relativeIndexTSPath, true));
        header = header.replaceAll('{distIndexPath}', options.indexJS.distIndexJSPath);

        //predelare of js
        let predeclare = '';
        for (let info of options.exports) {
            for (let exp of info.exports) {
                if (crTSExportParser.isRealExportType(exp.type)) {
                    predeclare && (predeclare += ' = ');
                    predeclare += exp.name;
                }
            }
        }
        if (predeclare) {
            predeclare = 'exports.' + predeclare + ' = void 0;';
        }
        predeclare = c_JSFilePredeclare.replace('{exports.predeclare}', predeclare);
        predeclare = ''; //关闭 void 0

        //export body
        let body = '';
        for (let info of options.exports) {
            if (info.solidExportCount > 0) {
                let importName = crPath.getFilename(info.tsPath, true);
                let reqline = c_JSRequire.replace('{importPath}', crASTHelper.relativeImportPath(options.indexTSBase, info.tsPath))
                reqline = reqline.replaceAll('{importName}', importName);
                body += '\n\n' + reqline;
                for (let exp of info.exports) {
                    if (crTSExportParser.isRealExportType(exp.type)) {
                        let expline = exp.isDefault ? c_JSExportDefault : c_JSExport;
                        expline = expline.replaceAll('{importName}', importName);
                        expline = expline.replaceAll('{exportName}', exp.name);
                        body += '\n' + expline;
                    }
                }
            }
        }

        //index.js content
        return `${header}\n${predeclare}\n${body}\n${c_JSFileEnd}`;
    }
}

/**
 * index.js.header
 */
const c_JSFileHeader = `
                (function() {
                    var nodeEnv = typeof require !== 'undefined' && typeof process !== 'undefined';
                    var __module = nodeEnv ? module : {exports:{}};
                    var __filename = '{distIndexPath}';
                    var __require = nodeEnv ? function (request) {
                        return cc.require(request);
                    } : function (request) {
                        return __quick_compile_project__.require(request, __filename);
                    };
                    function __define (exports, require, module) {
                        if (!nodeEnv) {__quick_compile_project__.registerModule(__filename, module);}"use strict";
cc._RF.push(module, '4c7ddBMPZZGFImXkTRgLYCA', '{tsIndexFileName}');
// {tsIndexPath}`;

/**
 * index.js.pre_declare_exports
 */
const c_JSFilePredeclare = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
{exports.predeclare}`;

/**
 * index.js.exports.body
 */
const c_JSFileBody = `//以下扫描项目源码生成
{exports.body}`;

/**
 * index.js.end
 */
const c_JSFileEnd = `cc._RF.pop();
                    }
                    if (nodeEnv) {
                        __define(__module.exports, __require, __module);
                    }
                    else {
                        __quick_compile_project__.registerModuleFunc(__filename, function () {
                            __define(__module.exports, __require, __module);
                        });
                    }
                })();`

/**
 * index.js: require line
 */
const c_JSRequire = `var {importName}_1 = require("{importPath}");`;
/**
 * index.js: export an import object of default
 */
const c_JSExportDefault = `exports.{exportName} = {importName}_1.default;`;
/**
 * index.js: export an import object
 */
const c_JSExport = `Object.defineProperty(exports, "{exportName}", { enumerable: true, get: function () { return {importName}_1.{exportName}; } });`;

/**
 * index.d.ts: header
 */
const c_TSFileHeader = `// 当前预处理代码由CRIK工具自动生成，请不要随意更改`;
/**
 * index.d.ts: re-export line
 */
const c_TSExport = `export {exportBody} from '{importPath}';`
