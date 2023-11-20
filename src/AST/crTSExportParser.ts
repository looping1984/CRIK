
import ts = require("typescript");
import { crFS } from "../crFS";
import { crUtil, is_null, not_null } from "../crUtil";
import { crASTHelper } from "./crASTHelper";

/**
 * ts导出类型
 */
export enum crTSExportType {
    /**
     * 全局变量
     */
    Var = 'var',
    /**
     * 全局函数
     */
    Func = 'func',
    /**
     * 枚举
     */
    Enum = 'enum',
    /**
     * 类
     */
    Class = 'class',
    /**
     * 接口（虚拟）
     */
    Interface = 'interface',
    /**
     * Type（虚拟）
     */
    Type = 'type',
}

/**
 * 一个export对象
 */
export interface crTSExportObject {
    /**
     * 导出名称
     */
    readonly name: string;
    /**
     * 导出类型
     */
    readonly type: crTSExportType;
    /**
     * 是否默认导出元素 (with 'default' keyword)
     */
    readonly isDefault: boolean;
}

/**
 * 一个import行
 */
export type crTSImportLine = {
    /**
     * import文件的绝对路径，undefined表示是一个require类型的import
     */
    tsPath: string;
    /**
     * import的模块路径（可能是相对路径，或者require里的路径）
     */
    modualPath: string;
    /**
     * imports: 导入的对象名称列表
     */
    imports: string[];
    /**
     * hasDefaultImport: imports列表的第一个元素是否采用默认导入的方式 (默认导出方式)
     */
    hasDefaultImport: boolean;
    /**
     * dependent: import语句里是否有被当前源码强依赖的导入对象
     */
    dependent: boolean;
}

/**
 * 一个ts源码的导出信息
 */
export type crTSExportInfo = {
    /**
     * ts绝对路径
     */
    tsPath?: string;
    /**
     * 当前源码的导出信息
     */
    exports: Array<crTSExportObject>;
    /**
     * 导出的真实对象（非Type和Interface）数量
     */
    solidExportCount: number;
    /**
     * 当前源码的imports（依赖项）
     */
    imports: Array<crTSImportLine>;
    /**
     * 强依赖项 依赖对象名称 - 导入行
     */
    depends: Record<string, crTSImportLine>;
};

/**
 * 解析ts export信息的参数
 */
export interface crTSExportParseOptions {
    /**
     * ts源文件绝对路径
     */
    tsPath?: string;
    /**
     * ts源代码文本内容
     */
    tsContent?: string;
    /**
     * 已解析的ts source
     */
    source?: ts.SourceFile;

    /**
     * import 路径的自定义解析方式，可选
     */
    resolvePath?: (from: string, to: string) => string;
    /**
     * 每导出一个对象时的回调，可选
     */
    exportAccept?: (tsPath: string, obj: crTSExportObject) => any;
}

/**
 * ts源码导出信息解析器
 */
export abstract class crTSExportParser {
    /**
     * 通过一个export信息数组，构建import行的import对象列表部分
     * @param exports 
     */
    static buildImportBody(exports: crTSExportObject[] | string[], firstIsDefault?: boolean) {
        if (!exports) {
            return '';
        }
        let defaultBody = '';
        let body = '';
        for (let i = 0; i < exports.length; ++i) {
            let exp = exports[i];
            if (typeof exp === 'string') {
                if (i === 0 && firstIsDefault) {
                    defaultBody = exp;
                } else {
                    if (body) {
                        body += ', ' + exp;
                    } else {
                        body = '{ ' + exp;
                    }
                }
            } else {
                if (exp.isDefault) {
                    if (defaultBody) {
                        return '<invalid import: multi default imports>';
                    }
                    defaultBody = exp.name;
                } else {
                    if (body) {
                        body += ', ' + exp.name;
                    } else {
                        body = '{ ' + exp.name;
                    }
                }
            }
        }
        body && (body += ' }');
        if (defaultBody) {
            body = body ? defaultBody + ', ' + body : defaultBody;
        }
        return body;
    }
    /**
     * 构建一个import行
     * @param importPathOrInfo import文件路径（已经resolve完毕的路径）
     * @param importOrExports 从importPath文件中导出（入）的对象列表
     * @returns 构建失败返回''
     */
    static buildImportLine(importPathOrInfo: string | crTSImportLine, importOrExports?: crTSExportObject[] | string[]) {
        let imptPath: string;
        let impts: crTSExportObject[] | string[];
        let firstIsDefault = false;
        if (typeof importPathOrInfo === 'string') {
            imptPath = importPathOrInfo;
            impts = importOrExports;
        } else {
            imptPath = importPathOrInfo.modualPath;
            impts = importPathOrInfo.imports;
            firstIsDefault = importPathOrInfo.hasDefaultImport;
        }
        let body = crTSExportParser.buildImportBody(impts, firstIsDefault);
        if (body) {
            return `import ${body} from "${imptPath}";`
        }
        return '';
    }
    /**
     * 构建一个export行
     * @param exports 待导出的对象列表
     * @returns 构建失败返回''
     */
    static buildExportLine(exports: crTSExportObject[]) {
        let body = crTSExportParser.buildExportBody(exports);
        if (body) {
            return `export ${body};`
        }
        return '';
    }
    /**
     * 通过一个export信息数组，构建export行的export对象列表部分
     * @param exports 
     */
    static buildExportBody(exports: crTSExportObject[]) {
        if (!exports) {
            return '';
        }
        let body = '';
        for (let i = 0; i < exports.length; ++i) {
            let exp = exports[i];
            if (body) {
                body += ', ' + exp.name;
            } else {
                body = '{ ' + exp.name;
            }
        }
        body && (body += ' }');
        return body;
    }
    /**
     * 判断给定的导出类型是否是真实导出类型（非Type和Interface）
     * @param type 导出类型
     * @returns 是否真实导出类型
     */
    static isRealExportType(type: crTSExportType) {
        return !crTSExportParser.isVirtualExportType(type);
    }
    /**
     * 判断给定的导出类型是否是虚拟导出类型（最终不会有任何代码）
     * @param type 导出类型
     * @returns 是否虚拟类型
     */
    static isVirtualExportType(type: crTSExportType) {
        return !type || type === crTSExportType.Interface || type === crTSExportType.Type;
    }

    static parseFromFile(tsAbsPath: string) {
        return crTSExportParser.parse({
            tsPath: tsAbsPath,
        });
    }
    static parseFromContent(sourceContent: string, tsAbsPath: string) {
        return crTSExportParser.parse({
            tsContent: sourceContent,
            tsPath: tsAbsPath,
        });
    }

    /**
     * 解析一个ts源码，抽出它的导出项和导入-依赖项
     * @param options 解析参数
     */
    static parse(options: crTSExportParseOptions) {
        //populate options
        options = crUtil.deepClone(options);
        let tsf = options.source;
        if (!tsf) {
            if (is_null(options.tsContent)) {
                options.tsContent = crFS.read_text(options.tsPath);
            }
            tsf = ts.createSourceFile(options.tsPath, options.tsContent, ts.ScriptTarget.ESNext);
        } else if (!options.tsPath) {
            options.tsPath = tsf.fileName;
        }
        options.resolvePath || (options.resolvePath = crASTHelper.resolveImportPath);

        let info: crTSExportInfo = {
            tsPath: options.tsPath,
            exports: [],
            solidExportCount: 0,
            imports: [],
            depends: {},
        };

        let addDependent = (dependee: string) => {
            if (info.depends[dependee]) {
                return;
            }
            for (let impt of info.imports) {
                if (impt.imports.includes(dependee)) {
                    impt.dependent = true;
                    info.depends[dependee] = impt;
                    break;
                }
            }
        };
        let addExport = (exportObj: crTSExportObject) => {
            options?.exportAccept(options.tsPath, exportObj);
            if (exportObj.isDefault) {
                info.exports.unshift(exportObj);
            } else {
                info.exports.push(exportObj);
            }
            if (crTSExportParser.isRealExportType(exportObj.type)) {
                ++info.solidExportCount;
            }
        };

        //先撸imports
        for (let statement of tsf.statements) {
            if (ts.isImportDeclaration(statement)) {
                //import
                let imptPath = crASTHelper.parseIdetifierText(statement.moduleSpecifier);
                let imptAbsPath = options.resolvePath(options.tsPath, imptPath);
                let imptLine: crTSImportLine = {
                    modualPath: imptPath,
                    tsPath: imptAbsPath,
                    imports: [],
                    hasDefaultImport: false,
                    dependent: false,
                };
                let clause = statement.importClause;
                let defaultImpt = crASTHelper.parseIdetifierText(clause.name);
                if (defaultImpt) {
                    imptLine.imports.push(defaultImpt);
                    imptLine.hasDefaultImport = true;
                }
                if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
                    for (let e of clause.namedBindings.elements) {
                        let impt = crASTHelper.parseIdetifierText(e.name);
                        imptLine.imports.push(impt);
                    }
                }
                info.imports.push(imptLine);
            } else if (ts.isImportEqualsDeclaration(statement)) {
                //require
                let imptPath = undefined;
                if (ts.isExternalModuleReference(statement.moduleReference)) {
                    imptPath = crASTHelper.parseIdetifierText(statement.moduleReference.expression);
                } else if (ts.isEntityName(statement.moduleReference)) {
                    imptPath = crASTHelper.parseIdetifierText(statement.moduleReference);
                }
                let defaultImpt = crASTHelper.parseIdetifierText(statement.name);
                if (!imptPath || !defaultImpt) {
                    console.warn("parse ts require line failed: ", options.tsPath);
                    continue;
                }
                let imptLine: crTSImportLine = {
                    modualPath: imptPath,
                    tsPath: undefined,
                    imports: [defaultImpt],
                    hasDefaultImport: true,
                    dependent: false,
                };
                info.imports.push(imptLine);
            }
        }

        //再撸exports，顺便搞depends
        for (let statement of tsf.statements) {
            if (ts.isClassDeclaration(statement)) {
                //export a class
                if (crASTHelper.isExported(statement)) {
                    let exportObject: crTSExportObject = {
                        name: crASTHelper.parseIdetifierText(statement.name),
                        type: crTSExportType.Class,
                        isDefault: crASTHelper.isDefault(statement),
                    };
                    addExport(exportObject);
                }
                if (statement.heritageClauses) {
                    for (let hc of statement.heritageClauses) {
                        if (hc.getText(tsf).startsWith('extends')) {
                            let heritage = crASTHelper.parseIdetifierText(hc.types[0].expression);
                            addDependent(heritage);
                        }
                    }
                }
                for (let m of statement.members) {
                    if (!ts.isPropertyDeclaration(m) || !crASTHelper.isStatic(m)) {
                        continue;
                    }
                    crTSExportParser._walkExpression(m.initializer, addDependent);
                }
            } else if (ts.isFunctionDeclaration(statement)) {
                //export a function
                if (crASTHelper.isExported(statement)) {
                    let exportObject: crTSExportObject = {
                        name: crASTHelper.parseIdetifierText(statement.name),
                        type: crTSExportType.Func,
                        isDefault: crASTHelper.isDefault(statement),
                    };
                    addExport(exportObject);
                }
            } else if (ts.isEnumDeclaration(statement)) {
                //export an enum
                if (crASTHelper.isExported(statement)) {
                    let exportObject: crTSExportObject = {
                        name: crASTHelper.parseIdetifierText(statement.name),
                        type: crTSExportType.Enum,
                        isDefault: crASTHelper.isDefault(statement),
                    };
                    addExport(exportObject);
                }
                if (statement.members) {
                    //enum memebers
                    for (let m of statement.members) {
                        crTSExportParser._walkExpression(m.initializer, addDependent);
                    }
                }
            } else if (ts.isVariableStatement(statement)) {
                //export some vars
                if (crASTHelper.isExported(statement)) {
                    for (let i = 0; i < statement.declarationList.declarations.length; ++i) {
                        let dec = statement.declarationList.declarations[i];
                        let exportObject: crTSExportObject = {
                            name: crASTHelper.parseIdetifierText(dec.name),
                            type: crTSExportType.Var,
                            isDefault: i === 0 && crASTHelper.isDefault(statement),
                        };
                        addExport(exportObject);
                        crTSExportParser._walkExpression(dec.initializer, addDependent);
                    }
                }
            } else if (ts.isInterfaceDeclaration(statement)) {
                //export an interface
                if (crASTHelper.isExported(statement)) {
                    let exportObject: crTSExportObject = {
                        name: crASTHelper.parseIdetifierText(statement.name),
                        type: crTSExportType.Interface,
                        isDefault: crASTHelper.isDefault(statement),
                    };
                    addExport(exportObject);
                }
            } else if (ts.isTypeAliasDeclaration(statement)) {
                //export a type
                if (crASTHelper.isExported(statement)) {
                    let exportObject: crTSExportObject = {
                        name: crASTHelper.parseIdetifierText(statement.name),
                        type: crTSExportType.Type,
                        isDefault: crASTHelper.isDefault(statement),
                    };
                    addExport(exportObject);
                }
            }
        }

        return info;
    }

    private static _walkExpression(exp: ts.Expression, recordDepend: (dependee: string) => any) {
        if (!exp) {
            return;
        }
        if (ts.isIdentifier(exp)) {
            //直接引用一个变量，或则 undefined
            let dependee = crASTHelper.parseIdetifierText(exp);
            if (dependee !== 'undefined') {
                recordDepend(dependee);
            }
        } else if (ts.isPropertyAccessExpression(exp)) {
            //一个get属性的引用方式
            let dependee = crTSExportParser._entryNameOfCallOrGetExpress(exp);
            if (dependee) {
                recordDepend(dependee);
            }
        } else if (ts.isCallExpression(exp)) {
            //一个函数引用
            let dependee = crTSExportParser._entryNameOfCallOrGetExpress(exp);
            if (dependee) {
                recordDepend(dependee);
            }
            if (exp.arguments) {
                for (let argExp of exp.arguments) {
                    crTSExportParser._walkExpression(argExp, recordDepend);
                }
            }
        } else if (ts.isNewExpression(exp)) {
            //new
            let dependee = crTSExportParser._entryNameOfCallOrGetExpress(exp);
            if (dependee) {
                recordDepend(dependee);
            }
            if (exp.arguments) {
                for (let argExp of exp.arguments) {
                    crTSExportParser._walkExpression(argExp, recordDepend);
                }
            }
        } else if (ts.isArrayLiteralExpression(exp)) {
            //array
            if (exp.elements) {
                for (let eleExp of exp.elements) {
                    crTSExportParser._walkExpression(eleExp, recordDepend);
                }
            }
        } else if (ts.isObjectLiteralExpression(exp)) {
            //{ }
            if (exp.properties) {
                for (let prop of exp.properties) {
                    if (ts.isPropertyAssignment(prop)) {
                        crTSExportParser._walkExpression(prop.initializer, recordDepend);
                    }
                }
            }
        } else {
            // ignore it
        }
    }

    private static _entryNameOfCallOrGetExpress(exp: ts.Expression) {
        if (!exp) {
            return undefined;
        }
        if (ts.isIdentifier(exp)) {
            return crASTHelper.parseIdetifierText(exp);
        }
        if (ts.isCallExpression(exp)) {
            return crTSExportParser._entryNameOfCallOrGetExpress(exp.expression);
        }
        if (ts.isPropertyAccessExpression(exp)) {
            return crTSExportParser._entryNameOfCallOrGetExpress(exp.expression);
        }
        if (ts.isNewExpression(exp)) {
            return crTSExportParser._entryNameOfCallOrGetExpress(exp.expression);
        }
        return undefined;
    }
}

