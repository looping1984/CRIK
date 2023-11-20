import { crFS } from "../crFS";
import { is_null } from "../crUtil";
import { crASTHelper } from "./crASTHelper";

/**
 * TS Source 读取辅助工具
 */
export abstract class crTSReader {
    /**
     * 是否输出详细日志，默认false
     */
    static logDetail: boolean = false;

    /**
     * 抽取ts源码经典三段：注释头、import段、代码本体段
     * @param sourcePath 
     * @returns 注释头、import段、代码本体段
     */
    static extractTrinity(sourcePath: string) {
        let res = {
            error: undefined,
            header: '',
            imports: '',
            body: '',
        };
        crTSReader.logDetail && console.log('extract trinity: ', sourcePath);
        let content = crFS.read_text(sourcePath);
        if (is_null(content)) {
            res.error = `file read failed: ${sourcePath}`;
            return res;
        }
        if (content.length === 0) {
            console.log('empty source file: ', sourcePath);
            return res;
        }
        let source: TSSourceReader = { content: content, index: 0 };
        crTSReader._walkCodeSections(source, (_, stype, begin, end) => {
            let section = content.substring(begin, end);
            if (stype === 'Import') {
                res.imports += section;
            } else {
                if (stype === 'SC' && !res.imports && !res.body) {
                    res.header += section;
                } else {
                    res.body += section;
                }
            }
        });
        return res;
    }

    /**
     * 将所有imports都梳理到顶部
     * @returns 是否梳理成功
     */
    static swinImports(sourcePath: string, destPath?: string) {
        destPath || (destPath = sourcePath);
        console.log('swin imports: ', sourcePath);
        let content = crFS.read_text(sourcePath);
        if (is_null(content)) {
            return false;
        }
        if (content.length === 0) {
            console.log('empty source file: ', sourcePath);
            return true;
        }
        let source: TSSourceReader = { content: content, index: 0 };
        let body = '';
        let imports = '';
        let success = crTSReader._walkCodeSections(source, (_, stype, begin, end) => {
            let str = content.substring(begin, end);
            if (stype === 'Import') {
                imports += str;
            } else {
                body += str;
            }
        });
        content = imports + body;
        return success && crFS.write_text(destPath, content, undefined, true);
    }

    /**
     * 读取下一段import
     */
    static _readImportBlock(source: TSSourceReader) {
        let block = {
            err: undefined,
            list: [],
        };
        while (true) {
            crTSReader._skipSpaceAndComment(source);
            if (crTSReader._isEnd(source)) {
                break;
            }
            let imptRes = crTSReader._readImportLine(source);
            if (imptRes.err) {
                block.err = imptRes.err;
                break;
            }
            if (!imptRes.success) {
                break;
            }
            block.list.push(imptRes);
        }
        return block;
    }

    /**
     * 读取剩下所有的import
     */
    private static _readAllImports(source: TSSourceReader) {
        let block = {
            err: undefined,
            list: [],
        };
        while (true) {
            crTSReader._moveToNextImport(source);
            if (crTSReader._isEnd(source)) {
                break;
            }
            let imptRes = crTSReader._readImportLine(source);
            if (imptRes.err) {
                block.err = imptRes.err;
                break;
            }
            if (!imptRes.success) {
                break;
            }
            block.list.push(imptRes);
        }
        return block;
    }


    /**
     * 查找到下一行import
     */
    private static _moveToNextImport(source: TSSourceReader) {
        let content = source.content;
        while (true) {
            let idx = source.index;
            crTSReader._skipSpaceAndComment(source);
            if (source.index > idx) {
                console.log('skip sc: \n', content.substring(idx, source.index));
            }
            if (crTSReader._isEnd(source)) {
                break;
            }
            if (content.startsWith('import ', source.index)) {
                break;
            }
            idx = source.index;
            crTSReader._moveToNextComment(source);
            if (source.index > idx) {
                console.log('skip body: \n', content.substring(idx, source.index));
            }
        }
    }

    /**
     * 读取下一行import
     */
    private static _readImportLine(source: TSSourceReader) {
        let content = source.content;
        let idx = source.index;
        let res = {
            err: undefined,
            success: false,
            begin: 0,
            end: 0,
            importLine: '',
            importPath: undefined,
            classes: [''],
            toMove: true,
        };
        let importFlag = 'import';
        if (!content.startsWith('import ', idx)) {
            return res;
        }
        crTSReader._skipLine(source);
        res.begin = idx;
        res.end = source.index;
        let fromIdx = content.indexOf('from', idx);
        if (fromIdx === -1 || fromIdx >= res.end) {
            source.index = idx;
            res.err = 'parse import failed: from missing';
            return;
        }
        if (source.path) {
            let pathIdx = content.indexOf('"', fromIdx);
            if (pathIdx !== -1) {
                let pathEnd = content.indexOf('"', pathIdx + 1);
                let importPath = content.substring(pathIdx + 1, pathEnd);
                res.importPath = crASTHelper.resolveImportPath(source.path, importPath);
            }
        }
        res.importLine = content.substring(res.begin, res.end);
        let classDesc = content.substring(res.begin + importFlag.length, fromIdx);
        let classes = classDesc.split(/\W+/);
        for (let c of classes) {
            c = c.trim();
            if (c.length > 0) {
                res.classes.push(c);
                // if (manualImportants && manualImportants.includes(c)) {
                //     res.toMove = false;
                // }
            }
        }
        res.success = true;
        return res;
    }
    private static _readNextLine(source: TSSourceReader) {
        let content = source.content;
        let idx = source.index;
        let str = '';
        while (idx < content.length) {
            let c = content.charAt(idx);
            str += c;
            ++idx;
            if (c === '\n' || c === '\r') {
                break;
            }
        }
        source.index = idx;
        return str;
    }
    /**
     * 遍历读取各种代码段（主要包括：注释与空白、import、其它代码）
     * @param source ts源代码
     * @param callback 读取一段代码后的回调
     */
    private static _walkCodeSections(source: TSSourceReader, callback: (source: TSSourceReader, type: 'SC' | 'Import' | 'Body', begin: number, end: number) => false | any) {
        let success = true;
        let content = source.content;
        while (source.index < content.length) {
            let pos = source.index;
            let c = content.charAt(pos);
            if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
                //space
                crTSReader._skipSpaceAndComment(source);
                if (callback(source, 'SC', pos, source.index) === false) {
                    break;
                }
                continue;
            }

            if (c === 'i' && content.startsWith('import ', pos)) {
                //import line
                crTSReader._skipLine(source);
                if (callback(source, 'Import', pos, source.index) === false) {
                    break;
                }
                continue;
            }

            if (c === '/') {
                //maybe comment (or maybe not)
                crTSReader._skipSpaceAndComment(source);
                if (pos < source.index) {
                    //comment read
                    if (callback(source, 'SC', pos, source.index) === false) {
                        break;
                    }
                    continue;
                }
            }

            //body
            crTSReader._skipBody(source);
            if (pos === source.index) {
                success = false;
                console.error('err: body not moved');
                break;
            }
            if (callback(source, 'Body', pos, source.index) === false) {
                break;
            }
        }
        return success;
    }

    private static _skipBody(source: TSSourceReader) {
        let content = source.content;
        let prec = undefined;
        while (true) {
            crTSReader._skipQuat(source);
            if (crTSReader._isEnd(source)) {
                break;
            }
            let c = content.charAt(source.index);
            if (c === 'i' && content.startsWith('import ', source.index) && (prec === '\r' || prec === '\n' || prec === undefined)) {
                break;
            }
            if (c === '/') {
                if (source.index + 1 < content.length) {
                    let nextC = content.charAt(source.index + 1);
                    if (nextC === '/' || nextC === '*') {
                        break;
                    }
                }
            }
            ++source.index;
            prec = c;
        }
    }
    private static _skipQuat(source: TSSourceReader) {
        if (crTSReader._isEnd(source)) {
            return;
        }
        let content = source.content;
        let idx = source.index;
        let quat = content.charAt(idx++);
        if (quat !== '"' && quat !== "'" && quat !== '`') {
            return;
        }
        let transing = false;
        while (idx < content.length) {
            let c = content.charAt(idx++);
            if (transing) {
                transing = false;
            } else if (c === '\\') {
                transing = true;
            }
            else if (quat === c) {
                break;
            }
        }
        source.index = idx;
    }

    private static _moveToNextComment(source: TSSourceReader) {
        let content = source.content;
        let idx = source.index;
        let quat = undefined;
        let transing = false;
        while (idx < content.length) {
            let c = content.charAt(idx);
            if (quat) {
                if (transing) {
                    transing = false;
                } else if (c === '\\') {
                    transing = true;
                }
                else if (quat === c) {
                    quat = undefined;
                }
            } else {
                if (c === '\'' || c === '"' || c === '`') {
                    quat = c;
                } else if (c === '/') {
                    break;
                }
            }
            ++idx;
        }
        source.index = idx;
    }
    private static _skipSpaceAndComment(source: TSSourceReader) {
        while (true) {
            if (crTSReader._isEnd(source)) {
                break;
            }
            crTSReader._skipSpace(source);
            if (crTSReader._isEnd(source)) {
                break;
            }
            if (!crTSReader._skipComment(source)) {
                break;
            }
        }
    }
    private static _skipComment(source: TSSourceReader) {
        let content = source.content;
        let idx = source.index;
        if (content.charAt(idx) !== '/') {
            return false;
        }
        let c = content.charAt(idx + 1);
        if (c === '/') {
            crTSReader._skipLine(source);
            return true;
        } else if (c === '*') {
            return crTSReader._skipUntil(source, '*/', true);
        }
        return false;
    }
    private static _skipLine(source: TSSourceReader) {
        let content = source.content;
        let idx = source.index;
        let meetEnd = false;
        while (idx < content.length) {
            let c = content.charAt(idx);
            let endChar = c === '\n' || c === '\r';
            if (meetEnd) {
                if (!endChar) {
                    break;
                }
            } else if (endChar) {
                meetEnd = true;
            }
            ++idx;
        }
        return crTSReader._setSourceIndex(source, idx);
    }
    private static _skipSpace(source: TSSourceReader) {
        let content = source.content;
        let idx = source.index;
        while (idx < content.length) {
            let c = content.charAt(idx);
            if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') {
                break;
            }
            ++idx;
        }
        return crTSReader._setSourceIndex(source, idx);
    }
    private static _skipUntil(source: TSSourceReader, str: string, skipThis: boolean) {
        let content = source.content;
        let idx = content.indexOf(str, source.index);
        if (idx === -1) {
            idx = content.length;
        } else if (skipThis) {
            idx += str.length;
        }
        return crTSReader._setSourceIndex(source, idx);
    }
    private static _setSourceIndex(source: TSSourceReader, index: number) {
        if (source.index !== index) {
            source.index = index;
            return true;
        }
        return false;
    }
    private static _isEnd(source: TSSourceReader) {
        return source.index >= source.content.length;
    }

}

type TSSourceReader = {
    content: string;
    index: number;
    path?: string;
}