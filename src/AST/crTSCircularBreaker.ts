import { crFS } from "../crFS";
import { AppendSlashType, crPath } from "../crPath";
import { crUtil } from "../crUtil";
import { crASTHelper } from "./crASTHelper";
import { crTSExportInfo, crTSExportParser } from "./crTSExportParser";
import { crJSIndexBuildOptions, crTSIndexBuilder } from "./crTSIndexBuilder";
import { crTSReader } from "./crTSReader";


/**
 * 循环依赖切断参数
 */
export type crTSCircularBreakOptions = {
    /**
     * 参与循环依赖切断的源代码根路径（绝对路径），文件夹之外的ts引用，被认为是外部引用，不做任何处理
     */
    sourceRoot: string;
    /**
     * 源文件类型扩展，可选，默认 '.ts'
     */
    sourcePatterns?: string | string[];
    /**
     * 源文件过滤器，可选。该过滤器返回false表示给定源文件被过滤掉，不参与循环依赖切断处理。默认只过滤掉 .d.ts 类型文件
     */
    sourceFilter?: (sourcePath: string, relativeSourcePath: string) => boolean;
    /**
     * 整个项目的入口ts文件（绝对路径），会对该文件进行特殊处理，可选
     */
    entryPath?: string;

    /**
     * 最终生成的index.d.ts文件路径（绝对路径）
     */
    outIndexTSPath: string;
    /**
     * 最终生成index.js需要的信息
     */
    indexJS?: crJSIndexBuildOptions;
};

/**
 * 循环依赖切断工具
 */
export abstract class crTSCircularBreaker {
    /**
     * 是否输出详细日志，默认false
     */
    static logDetail: boolean = false;

    /**
     * 循环依赖处理
     * @param sourceRoot 源文件总文件夹（该文件夹以外的文件认为是外部引用，不会被处理）
     * @param indexTSPath index.d.ts 文件路径（绝对路径）
     * @param entryPath 项目入口文件，可选
     * @param indexJS 生成index.js需要的参数，可选，不填则不生成
     * @param filter 文件过滤器，可选，默认过滤掉 .d.ts 后缀的文件
     * @param patterns 文件类型（列表），可选。默认ts后缀的文件
     * @returns 是否成功
     */
    static circularBreakFolder(sourceRoot: string, indexTSPath: string, entryPath?: string, indexJS?: crJSIndexBuildOptions, filter?: (tsPath: string, relativePath: string) => boolean, patterns?: string | string[]) {
        return crTSCircularBreaker.circularBreak({
            sourceRoot: sourceRoot,
            sourcePatterns: patterns,
            sourceFilter: filter,
            entryPath: entryPath,
            outIndexTSPath: indexTSPath,
            indexJS: indexJS,
        });
    }

    /**
     * 循环依赖处理
     * @param options 处理参数
     * @returns 是否处理成功
     */
    static circularBreak(options: crTSCircularBreakOptions) {
        options = crUtil.deepClone(options);
        options.sourceRoot = crPath.standardize(options.sourceRoot, AppendSlashType.Rudely);
        options.sourcePatterns || (options.sourcePatterns = '.ts');
        options.sourceFilter || (options.sourceFilter = (sourcPath: string, relativeSourcePath: string) => {
            if (sourcPath.endsWith('.d.ts')) {
                return false;
            }
            if (options.entryPath === sourcPath || options.outIndexTSPath === sourcPath) {
                return false;
            }
            return true;
        });
        options.entryPath && (options.entryPath = crPath.standardize(options.entryPath, AppendSlashType.Never));

        //collect all sources
        let sourceFilePaths: string[] = [];
        crPath.traverseGoodFile(options.sourceRoot, options.sourcePatterns, true, (filePath, relativePath, fileName) => {
            if (options.sourceFilter(filePath, relativePath)) {
                sourceFilePaths.push(filePath);
            }
        });

        console.log('[CRIK]\ncircular breaker start..');
        console.log('typescript source count: ', sourceFilePaths.length);
        console.log('predefine index file: ', options.outIndexTSPath);
        if (options.entryPath) {
            console.log('entry file: ', options.entryPath);
        }

        //collect all exports
        let obj2File: Record<string, string> = {};
        let file2ExpInfo: Record<string, crTSExportInfo> = {};
        let exports: Array<crTSExportInfo> = [];
        for (let sourcePath of sourceFilePaths) {
            if (file2ExpInfo[sourcePath]) {
                console.error(`source path duplicated: ${sourcePath}`);
                return false;
            }
            crTSCircularBreaker.logDetail && console.log('process source:', sourcePath);
            let exportInfo = crTSExportParser.parse({
                tsPath: sourcePath,
                exportAccept: (tsPath, obj) => {
                    let exist = obj2File[obj.name];
                    if (exist && exist !== tsPath) {
                        throw new Error(`export name conflix: ${obj.name}\n${exist}\n${tsPath}`);
                    }
                    exist || (obj2File[obj.name] = tsPath);
                },
            });
            file2ExpInfo[exportInfo.tsPath] = exportInfo;
            exports.push(exportInfo);
        }
        let obj2ExpInfo: Record<string, crTSExportInfo> = {};
        for (let obj in obj2File) {
            let expInfo = file2ExpInfo[obj2File[obj]];
            if (!expInfo) {
                console.error(`export obj's file not found: : ${obj}`);
                return false;
            }
            obj2ExpInfo[obj] = expInfo;
        }

        //sort by alphabet
        exports.sort((lhs, rhs) => {
            if (lhs.tsPath < rhs.tsPath) {
                return -1;
            }
            if (lhs.tsPath > rhs.tsPath) {
                return 1;
            }
            return 0;
        });
        //reorder ts node by reference relationships
        exports = CircularUtil.sortTSNodes(exports, file2ExpInfo, obj2ExpInfo);
        if (!exports) {
            return false;
        }

        //modify each ts source's imports: replace them with indexTsPath
        for (let tsnode of exports) {
            let trinity = crTSReader.extractTrinity(tsnode.tsPath);
            if (trinity.error) {
                console.error(`parse ts source failed: ${tsnode.tsPath}`);
                return false;
            }
            let imports = '';
            for (let imptline of tsnode.imports) {
                let willReplace = true;
                for (let impt of imptline.imports) {
                    if (!obj2ExpInfo[impt]) {
                        willReplace = false;
                        break;
                    }
                }
                let line: string;
                if (willReplace) {
                    line = crTSExportParser.buildImportLine(crASTHelper.relativeImportPath(tsnode.tsPath, options.outIndexTSPath), imptline.imports);
                } else {
                    line = crTSExportParser.buildImportLine(imptline);
                }
                if (line) {
                    imports += line + '\n';
                }
            }
            let source = trinity.header + imports + trinity.body;
            if (!crFS.write_text(tsnode.tsPath, source, undefined, true)) {
                return false;
            }
        }

        if (!crTSIndexBuilder.generate({
            exports: exports,
            outIndexTSPath: options.outIndexTSPath,
            indexJS: options.indexJS
        })) {
            return false;
        }

        //write entry ts
        if (options.entryPath && options.indexJS) {
            options.indexJS.outIndexJSPath = crPath.standardize(options.indexJS.outIndexJSPath, AppendSlashType.Never);
            let entryContent = crFS.read_text(options.entryPath);
            if (!entryContent) {
                return false;
            }
            let begin = entryContent.indexOf(c_entry_safeguard_begin);
            let end = -1;
            if (begin !== -1) {
                end = entryContent.indexOf(c_entry_safeguard_end, begin + c_entry_safeguard_begin.length);
            }
            begin = _moveLine(entryContent, begin, true);
            end = _moveLine(entryContent, end, false);
            let insert = c_entry_header.replace('{requireIndexJSPath}', crASTHelper.relativeImportPath(options.entryPath, options.outIndexTSPath));
            if (begin !== -1 && end !== -1) {
                console.log('entry header:', begin, end);
                entryContent = entryContent.substring(0, begin) + insert + '\n' + entryContent.substring(end);
            } else {
                entryContent = insert + '\n' + entryContent;
            }
            if (!crFS.write_text(options.entryPath, entryContent, undefined, true)) {
                return false;
            }
        }
        return true;
    }
}

function _moveLine(str: string, idx: number, reverse: boolean) {
    if (idx === -1) {
        return -1;
    }
    if (reverse) {
        while (idx > 0) {
            let c = str.charAt(idx);
            if (c === '\r' || c === '\n') {
                ++idx;
                break;
            }
            --idx;
        }
    } else {
        while (idx < str.length) {
            let c = str.charAt(idx++);
            if (c === '\r' || c === '\n') {
                if (idx < str.length) {
                    let c2 = str.charAt(idx);
                    if (c2 === '\r' || c2 === '\n') {
                        if (c2 !== c) {
                            ++idx;
                        }
                    }
                }
                break;
            }
        }
    }
    return idx;
}

const c_entry_safeguard_begin = '[CRIK.safeguard.begin]';
const c_entry_safeguard_end = '[CRIK.safeguard.end]';

const c_entry_header = `// ${c_entry_safeguard_begin}
require('{requireIndexJSPath}');
// ${c_entry_safeguard_end}`;


type tsNode = crTSExportInfo & {
    visited?: boolean;
};

abstract class CircularUtil {
    static sortTSNodes(_tsInfoList: crTSExportInfo[], _ts2ExpInfo: Record<string, crTSExportInfo>, _obj2ExpInfo: Record<string, crTSExportInfo>) {
        let nodes = _tsInfoList as any as tsNode[];
        let ts2node = _ts2ExpInfo as any as Record<string, tsNode>;
        let obj2node = _obj2ExpInfo as any as Record<string, tsNode>;
        let sorted: Array<tsNode> = [];
        let circular: Array<string> = [];
        for (let node of nodes) {
            if (!CircularUtil._visitNode(node, sorted, circular, ts2node, obj2node)) {
                console.error('circular dependencies: ', circular.join('->\n'));
                return undefined;
            }
        }
        return sorted;
    }
    private static _visitNode(node: tsNode, sorted: Array<tsNode>, circular: Array<string>, ts2node: Record<string, tsNode>, obj2node: Record<string, tsNode>) {
        if (circular.includes(node.tsPath)) {
            return false;
        }
        if (node.visited) {
            return true;
        }
        node.visited = true;
        circular.push(node.tsPath);
        for (let depName in node.depends) {
            let dep = obj2node[depName];
            if (!dep) {
                crTSCircularBreaker.logDetail && console.log('dependent not found: ', node.tsPath, ' -> ', depName);
                continue;
            }
            if (!CircularUtil._visitNode(dep, sorted, circular, ts2node, obj2node)) {
                return false;
            }
        }
        circular.pop();
        sorted.push(node);
        return true;
    }
}