import ts = require("typescript");
import { crFS } from "../crFS";
import { crMoreUtil } from "../crMoreUtil";
import { crPath } from "../crPath";
import { crASTHelper } from "./crASTHelper";

export type tsmVisiEnum = 'public' | 'protected' | 'private';
export type tsmTypeEnum = 'interface' | 'struct' | 'abstract' | 'class';

/**
 * ts修饰符
 */
export type tsmDecorator = {
    /**
     * 修饰函数名称
     */
    name: string;
    /**
     * 修饰函数参数列表
     */
    params?: any[];
};

/**
 * ts类型引用
 */
export type tsmTypeRef = {
    /**
     * 类型名称
     */
    name: string;
    /**
     * 数组维度，0或者undefined表示不是数组
     */
    aryDim?: number;
    /**
     * 类型定义所在的路径，无路径表示是ts定义的内建类型
     */
    tsPath?: string;
    /**
     * 一个匿名的type定义，可选
     */
    tsDef?: tsmTypeDef;
};

/**
 * 字段
 */
export type tsmField = {
    /**
     * 字段名称
     */
    name: string;
    /**
     * 字段类型
     */
    type: tsmTypeRef;
    /**
     * 可见性
     */
    visiEnum: tsmVisiEnum;
    /**
     * 字段修饰符列表
     */
    decorators?: tsmDecorator[];
};

/**
 * 类型定义
 */
export type tsmTypeDef = {
    /**
     * 类型名称
     */
    name: string;
    /**
     * 所属的ts文件路径
     */
    tsPath: string;
    /**
     * 类型枚举
     */
    typeEnum: tsmTypeEnum;
    /**
     * 是否对外导出，默认否
     */
    exported?: boolean;
    /**
     * 是否为当前ts文件的默认导出，默认否
     */
    default?: boolean;
    /**
     * 修饰符
     */
    decorators?: tsmDecorator[];
    /**
     * 父类型
     */
    parents?: tsmTypeRef[];
    /**
     * 字段列表
     */
    fields?: tsmField[];
};

/**
 * 一个ts文件的信息
 */
export type tsmTS = {
    path: string,
    md5: string;
    classes?: Record<string, tsmTypeDef>;
    imports?: Record<string, string>;
}

/**
 * 扫描参数
 */
export type tsmScanArgs = {
    /**
     * ts根路径（必须与tsconfig.json配置一致）
     */
    tsRoot: string;
    /**
     * 待排除的文件（夹）列表（相对tsRoot路径），可选
     */
    excludes?: string[];
    /**
     * 本次扫描单独指定的文件夹列表（相对tsRoot路径），可选。默认整个tsRoot根路径
     */
    specialFolders?: string[];
    /**
     * 最近一次扫描结果，用来加速扫描，可选
     */
    oldDic?: Record<string, tsmTS>;
}

let __g_cur_ts: ts.SourceFile;

export abstract class crTSMonoParser {
    /**
     * 解析并扫描所有给定ts源文件并返回TSMono的声明信息
     * @param args 扫描参数
     * @returns 
     */
    static scan(args: tsmScanArgs) {
        let tsRoot = crTSPHelper.standarizePath(args.tsRoot);
        let specialFolders = crTSPHelper.relative2absPath(args.specialFolders, tsRoot, undefined, true);
        let excludes = crTSPHelper.relative2absPath(args.excludes, tsRoot, undefined, true);
        let isExcluded = function (path: string) {
            if (excludes) {
                for (let e of excludes) {
                    if (path.startsWith(e)) {
                        return true;
                    }
                }
            }
            return false;
        };
        let oldDic = args.oldDic;
        let tsdic: Record<string, tsmTS> = {};
        if (!oldDic || !specialFolders) {
            specialFolders = [tsRoot];
        }
        oldDic || (oldDic = {});
        for (let folder of specialFolders) {
            if (!folder.startsWith(tsRoot)) {
                //忽略tsRoot以外的文件夹
                continue;
            }
            if (isExcluded(folder)) {
                //被排除的文件夹
                continue;
            }
            crPath.traverseGoodFile(folder, '.ts', true, (absPath) => {
                absPath = crPath.standardize(absPath);
                if (isExcluded(absPath)) {
                    //被排除的ts
                    return;
                }
                let tsPath = crTSPHelper.abs2relativePath(absPath, tsRoot);
                if (!tsPath) {
                    return;
                }
                let tsinfo = oldDic[tsPath];
                let md5 = crMoreUtil.fileMD5(tsPath);
                if (!md5) {
                    return;
                }
                if (tsinfo) {
                    if (tsinfo.md5 !== md5) {
                        crTSMonoParser._clearTSInfo(tsinfo);
                        tsinfo.md5 = md5;
                    }
                } else {
                    tsinfo = {
                        path: tsPath,
                        md5: md5,
                    };
                }
                tsdic[tsPath] = tsinfo;
            });
        }
        for (let tsPath in tsdic) {
            let tsinfo = tsdic[tsPath];
            if (tsinfo.classes) {
                continue;
            }
            crTSMonoParser._parseTSInfo(tsRoot, tsinfo);
        }
        return tsdic;
    }

    static parse(tsRoot: string, tsPath: string) {
        tsRoot = crTSPHelper.standarizePath(tsRoot);
        tsPath = crTSPHelper.resolvePath(tsPath, tsRoot, undefined, true);
        let tsinfo: tsmTS = {
            path: tsPath,
            md5: undefined,
        };
        crTSMonoParser._parseTSInfo(tsRoot, tsinfo);
        return tsinfo;
    }

    private static _parseTSInfo(tsRoot: string, tsinfo: tsmTS) {
        let absPath = tsRoot + tsinfo.path;
        let source = crFS.read_text(absPath);
        let tsf = ts.createSourceFile(absPath, source, ts.ScriptTarget.ESNext);
        __g_cur_ts = tsf;
        let classes = tsinfo.classes || {};
        let imports = tsinfo.imports || {};
        if (tsf.statements) {
            for (let st of tsf.statements) {
                if (st.kind === ts.SyntaxKind.ImportDeclaration) {
                    crTSMonoParser._parseImportDef(tsRoot, tsinfo.path, st, imports);
                } else {
                    crTSMonoParser._parseTypeDef(tsRoot, tsinfo.path, st, classes);
                }
            }
        }
        tsinfo.classes = classes;
        tsinfo.imports = imports;
        crTSMonoParser._fullfillClasses(tsinfo);
        __g_cur_ts = undefined;
    }
    private static _parseImportDef(tsRoot: string, tsPath: string, node: ts.Node, imports: Record<string, string>) {
        if (ts.isImportDeclaration(node)) {
            let impPath = crTSPHelper.resolvePath(crPath.replaceExt(crTSPHelper.parseIdetifierText(node.moduleSpecifier), 'ts'), tsRoot, tsPath);
            let clause = node.importClause;
            let defImp = crTSPHelper.parseIdetifierText(clause.name);
            if (defImp) {
                imports[defImp] = impPath;
            }
            if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
                for (let e of clause.namedBindings.elements) {
                    imports[crTSPHelper.parseIdetifierText(e.name)] = impPath;
                }
            }
        }
    }
    private static _parseTypeDef(tsRoot: string, tsPath: string, node: ts.Node, classes: Record<string, tsmTypeDef>) {
        let name = crTSPHelper.parseDeclareName(node);
        if (!name) {
            return;
        }
        let tsm: tsmTypeDef;
        let tstype: tsmTypeEnum;
        if (ts.isInterfaceDeclaration(node)) {
            tstype = 'interface';
        } else if (ts.isTypeAliasDeclaration(node)) {
            tstype = 'struct';
        } else if (ts.isClassDeclaration(node)) {
            tstype = crASTHelper.isAbstract(node) ? 'abstract' : 'class';
        }
        if (!tstype) {
            return;
        }
        tsm = {
            name: name,
            tsPath: tsPath,
            typeEnum: tstype,
            exported: crASTHelper.isExported(node),
            default: crASTHelper.isDefault(node) || undefined,
            decorators: crTSPHelper.parseDecorators(node),
            fields: crTSPHelper.parseFields(node),
            parents: crTSPHelper.parseParents(node),
        };
        classes[name] = tsm;
    }
    private static _fullfillClasses(tsinfo: tsmTS) {
        for (let cname in tsinfo.classes) {
            let c = tsinfo.classes[cname];
            crTSMonoParser._fullfillTypeDef(c, tsinfo);
        }
    }
    private static _fullfillTypeDef(t: tsmTypeDef, tsinfo: tsmTS) {
        if (!t) {
            return;
        }
        if (t.fields) {
            for (let f of t.fields) {
                crTSMonoParser._fullfillTypeRef(f.type, tsinfo);
            }
        }
        if (t.parents) {
            for (let p of t.parents) {
                crTSMonoParser._fullfillTypeRef(p, tsinfo);
            }
        }
    }
    private static _fullfillTypeRef(r: tsmTypeRef, tsinfo: tsmTS) {
        if (!r) {
            return;
        }
        if (r.tsDef) {
            crTSMonoParser._fullfillTypeDef(r.tsDef, tsinfo);
        } else if (!r.tsPath && !crTSPHelper.isBuiltinType(r.name)) {
            r.tsPath = crTSMonoParser._getTypeDefTSPath(r.name, tsinfo);
        }
    }
    private static _getTypeDefTSPath(name: string, tsinfo: tsmTS) {
        if (tsinfo.classes[name]) {
            return tsinfo.path;
        }
        return tsinfo.imports[name];
    }
    private static _clearTSInfo(tsinfo: tsmTS) {
        tsinfo.classes = undefined;
        tsinfo.imports = undefined;
    }
}

export abstract class crTSPHelper {
    static parseIdetifierText(node: ts.Node) {
        if (!node) {
            return undefined;
        }
        if (ts.isIdentifier(node)) {
            return node.text;
        }
        if (ts.isStringLiteral(node)) {
            return node.text;
        }
        return undefined;
    }
    static parseDeclareName(node: ts.Node) {
        if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isClassDeclaration(node)) {
            return crTSPHelper.parseIdetifierText(node.name);
        }
        return undefined;
    }
    static parseDecorators(n: ts.Node) {
        let dss = ts.canHaveDecorators(n) ? ts.getDecorators(n) : undefined;
        if (!dss) {
            return undefined;
        }
        let ds: tsmDecorator[] = [];
        for (let d of dss) {
            let pd = crTSPHelper.parseOnDecorator(d);
            pd && (ds.push(pd));
        }
        return ds;
    }
    static parseOnDecorator(n: ts.Decorator): tsmDecorator {
        if (!n || !n.expression) {
            return undefined;
        }
        let dec: tsmDecorator = {
            name: '',
        };
        crTSPHelper.parseDecExpression(n.expression, dec);
        if (dec.name) {
            return dec;
        }
        return undefined;
    }
    static parseDecExpression(e: ts.Node, dec: tsmDecorator) {
        if (!e) {
            return;
        }
        if (ts.isIdentifier(e)) {
            if (dec.name) {
                dec.name += '.' + crTSPHelper.parseIdetifierText(e);
            } else {
                dec.name = crTSPHelper.parseIdetifierText(e);
            }
        } else if (ts.isPropertyAccessExpression(e)) {
            crTSPHelper.parseDecExpression(e.expression, dec);
            crTSPHelper.parseDecExpression(e.name, dec);
        } else if (ts.isCallExpression(e)) {
            crTSPHelper.parseDecExpression(e.expression, dec);
            if (e.arguments && e.arguments.length > 0) {
                dec.params = [];
                for (let a of e.arguments) {
                    dec.params.push(crTSPHelper.parseDecExpArg(a));
                }
            }
        }
    }
    static parseDecExpArg(a: ts.Expression) {
        if (ts.isStringLiteral(a)) {
            return a.text;
        } else if (ts.isNumericLiteral(a)) {
            return parseFloat(a.text);
        } else if (a.kind === ts.SyntaxKind.FalseKeyword) {
            return false;
        } else if (a.kind === ts.SyntaxKind.TrueKeyword) {
            return true;
        } else if (a.kind === ts.SyntaxKind.NullKeyword) {
            return null;
        } else if (ts.isObjectLiteralExpression(a)) {
            //{x=2, y='yxda'}类似的直接对象
            let jsonStr = a.getFullText(__g_cur_ts);
            let obj;
            eval('obj= ' + jsonStr);
            return obj;
        } else if (ts.isArrayLiteralExpression(a)) {
            //数组参数
            let jsonStr = a.getFullText(__g_cur_ts);
            let obj;
            eval('obj= ' + jsonStr);
            return obj;
        } else if (ts.isIdentifier(a)) {
            if (a.text === 'undefined') {
                return null; //undefined看做null
            } else {
                //运行时变量作为参数暂时不支持
                return null;
            }
        } else {
            //其它类型不识别
            return null;
        }
    }
    static parseFields(n: ts.Node) {
        if (ts.isInterfaceDeclaration(n)) {
            return crTSPHelper.parseProperties(n.members);
        } else if (ts.isTypeAliasDeclaration(n)) {
            if (ts.isTypeLiteralNode(n.type)) {
                return crTSPHelper.parseProperties(n.type.members);
            }
        } else if (ts.isClassDeclaration(n)) {
            return crTSPHelper.parseProperties(n.members);
        }
        return undefined;
    }
    static parseProperties(members: ts.NodeArray<ts.TypeElement | ts.ClassElement>, fds?: tsmField[]): tsmField[] {
        if (!members || members.length === 0) {
            return fds;
        }
        fds || (fds = []);
        for (let m of members) {
            if (ts.isPropertySignature(m)) {
                let fd = crTSPHelper.parseOnProperty(m);
                fd && (fds.push(fd));
            } else if (ts.isPropertyDeclaration(m)) {
                let fd = crTSPHelper.parseOnProperty(m);
                fd && (fds.push(fd));
            }
        }
        return fds;
    }
    static parseOnProperty(m: ts.PropertySignature | ts.PropertyDeclaration) {
        let fd: tsmField = {
            name: crTSPHelper.parseIdetifierText(m.name),
            visiEnum: crTSPHelper.parseVisibility(m),
            decorators: crTSPHelper.parseDecorators(m),
            type: crTSPHelper.parseTypeRefOfProperty(m.type),
        };
        return fd;
    }
    static parseTypeRefOfProperty(type: ts.TypeNode): tsmTypeRef {
        let typeRef: tsmTypeRef = {
            name: undefined,
        };
        crTSPHelper._parseTypeRefInfo(type, typeRef);
        return typeRef;
    }
    private static _parseTypeRefInfo(typeNode: ts.TypeNode, typeRef: tsmTypeRef) {
        if (ts.isArrayTypeNode(typeNode)) {
            //数组
            typeRef.aryDim || (typeRef.aryDim = 0);
            ++typeRef.aryDim;
            crTSPHelper._parseTypeRefInfo(typeNode.elementType, typeRef);
        }
        else if (ts.isTypeLiteralNode(typeNode)) {
            //匿名结构定义
            let typeDef: tsmTypeDef = {
                name: undefined,
                tsPath: undefined,
                typeEnum: 'struct',
                decorators: crTSPHelper.parseDecorators(typeNode),
                fields: crTSPHelper.parseProperties(typeNode.members),
            };
            typeRef.name = undefined;
            typeRef.tsDef = typeDef;
        }
        else if (ts.isTypeReferenceNode(typeNode)) {
            //引用其它结构定义
            typeRef.name = crTSPHelper.parseIdetifierText(typeNode.typeName);
        } else {
            //内建类型
            if (typeNode.kind === ts.SyntaxKind.NumberKeyword) {
                typeRef.name = 'number';
            }
            else if (typeNode.kind === ts.SyntaxKind.StringKeyword) {
                typeRef.name = 'string';
            }
            else if (typeNode.kind === ts.SyntaxKind.BooleanKeyword) {
                typeRef.name = 'boolean';
            } else {
                typeRef.name = 'any';
            }
        }
    }
    static parseVisibility(m: ts.PropertyDeclaration | ts.Node): tsmVisiEnum {
        if (m.modifiers) {
            for (let mm of m.modifiers) {
                if (mm.kind === ts.SyntaxKind.PublicKeyword) {
                    return 'public';
                } else if (mm.kind === ts.SyntaxKind.ProtectedKeyword) {
                    return 'protected';
                } else if (mm.kind === ts.SyntaxKind.PrivateKeyword) {
                    return 'private';
                }
            }
        }
        return 'public';
    }
    static isBuiltinType(name: string) {
        return name === 'string' || name === 'number' || name === 'boolean' || name === 'any';
    }
    static parseParents(n: ts.Node) {
        if (ts.isInterfaceDeclaration(n) || ts.isClassDeclaration(n)) {
            return crTSPHelper.parseHeritages(n.heritageClauses);
        }
        return undefined;
    }
    static parseHeritages(hc: ts.NodeArray<ts.HeritageClause>) {
        if (!hc) {
            return undefined;
        }
        let parents: tsmTypeRef[] = [];
        for (let h of hc) {
            if (!h.types) continue;
            for (let type of h.types) {
                let exp = crTSPHelper.parseIdetifierText(type.expression);
                exp && (parents.push({
                    name: exp,
                }));
            }
        }
        return parents;
    }

    static resolvePath(tsPath: string, tsRoot: string, refPath?: string, standarizeFirstly?: boolean) {
        let absPath = crTSPHelper.relative2absPath(tsPath, tsRoot, refPath, standarizeFirstly);
        return crTSPHelper.abs2relativePath(absPath, tsRoot);
    }
    static relative2absPath<T extends string | string[]>(revPath: T, root: string, refPath?: string, standarizeFirstly?: boolean): T {
        if (!revPath) {
            return undefined;
        }
        standarizeFirstly && (revPath = crTSPHelper.standarizePath(revPath));
        if (typeof revPath === 'string') {
            if (!revPath.includes(':')) {
                if (refPath && revPath.startsWith('.')) {
                    refPath = crPath.join(root, refPath, true);
                    if (crPath.isFile(refPath)) {
                        refPath = crPath.appendLastSlash(crPath.getParentFolder(refPath));
                    }
                } else {
                    refPath = root;
                }
                revPath = crPath.join(refPath, revPath, true) as any;
            }
        } else {
            for (let i = 0; i < revPath.length; ++i) {
                revPath[i] = crTSPHelper.relative2absPath(revPath[i], root, refPath);
            }
        }
        return revPath;
    }
    static abs2relativePath<T extends string | string[]>(absPath: T, root: string, standarizeFirstly?: boolean): T {
        if (!absPath) {
            return undefined;
        }
        standarizeFirstly && (crTSPHelper.standarizePath(absPath));
        if (typeof absPath === 'string') {
            if (absPath.startsWith(root)) {
                absPath = absPath.substr(root.length) as any;
            } else {
                absPath = undefined;
            }
        } else {
            for (let i = 0; i < absPath.length; ++i) {
                absPath[i] = crTSPHelper.abs2relativePath(absPath[i], root);
            }
        }
        return absPath;
    }
    static standarizePath<T extends string | string[]>(paths: T): T {
        if (!paths) {
            return undefined;
        }
        if (typeof paths === 'string') {
            paths = crPath.standardize(paths, true) as any;
        } else {
            for (let i = 0; i < paths.length; ++i) {
                paths[i] = crPath.standardize(paths[i], true);
            }
        }
        return paths;
    }
}