import * as fs from "fs";
import jpath = require("path");
import { is_null } from "./crUtil";
/**
 * 补足最后斜杠的方式
 */
export enum AppendSlashType {
    /**
     * 不要补足
     */
    Never = -1,
    /**
     * 自动补足
     */
    Auto = 1,
    /**
     * 强制补足
     */
    Rudely = 2,
}

/**
 * 路径相关的工具
 * 包括对文件夹的处理
 */
export class crPath {
    /**
     * 当前运行路径
     */
    static get currentDirectory() {
        return process.cwd();
    }
    /**
     * 版本号转化为可以放到文件路径中的名称 0.0.1 -> 0_0_1
     *  @param ver 版本号，比如 0.2.54
     * @return 别名，比如 0_2_54
     */
    static ver2name(ver: string) {
        if (!ver) {
            return ver;
        }
        return ver.replace(/\./g, '_');
    }
    /**
     * 获取文件名
     *  @param p 文件路径
     * @param withoutExt 是否不要后缀，默认false，表示包括后缀
     * @return 文件名
     * @remarks 该函数与getFilename的区别是在处理后缀上：
     * getFilename: 文件名最后一个点之后的所有字符被认为是后缀 (index.d.ts -> index.d)
     * getFilename2: 文件名第一个点之后的所有字符被认为是后缀 (index.d.ts -> index)
     */
    static getFilename(p: string, withoutExt: boolean = false) {
        let dir = jpath.parse(p)
        return withoutExt ? dir.name : dir.base;
    }
    /**
     * 获取文件名（去除路径）
     * @param fpath 待处理的路径
     * @param withoutExt 是否去除后缀，默认false（表示包括后缀）
     * @returns 文件名
     * @remarks 该函数与getFilename的区别是在处理后缀上：
     * getFilename: 文件名最后一个点之后的所有字符被认为是后缀 (index.d.ts -> index.d)
     * getFilename2: 文件名第一个点之后的所有字符被认为是后缀 (index.d.ts -> index)
     */
    static getFilename2(fpath: string, withoutExt: boolean = false) {
        if (!fpath) {
            return fpath;
        }
        let begin = Math.max(fpath.lastIndexOf('/'), fpath.lastIndexOf('\\')) + 1;
        if (withoutExt) {
            //不要后缀
            let dotIdx = fpath.indexOf('.', begin);
            if (dotIdx !== -1) {
                //的确有后缀
                return fpath.substring(begin, dotIdx);
            }
        }
        //要后缀，或者没有后缀
        return begin === 0 ? fpath : fpath.substring(begin);
    }
    /**
     * 获取文件的后缀
     *  @param p 文件路径
     * @param withDot 返回的后缀是否包含点（.），可选，默认不包含
     * @return 文件后缀，如果没有后缀，返回空字符串
     */
    static getExt(p: string, withDot?: boolean) {
        let dir = jpath.parse(p);
        let ext = !dir.ext ? '' : dir.ext;
        if (ext.length > 0) {
            if (withDot) {
                if (ext[0] !== '.') {
                    ext = '.' + ext;
                }
            }
            else {
                if (ext[0] === '.') {
                    ext = ext.substr(1);
                }
            }
        }
        return ext;
    }
    /**
     * 获取文件的后缀
     *  @param p 文件路径
     * @param withDot 返回的后缀是否包含点（.），可选，默认不包含
     * @return 文件后缀，如果没有后缀，返回空字符串
     */
    static getExt2(p: string, withDot?: boolean) {
        if (!p) {
            return '';
        }
        let slashIdx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
        let dotIdx = p.indexOf('.', slashIdx + 1);
        if (dotIdx === -1) {
            return '';
        }
        return p.substring(withDot ? dotIdx : dotIdx + 1);
    }
    /**
     * 替换给定文件路径的后缀名
     * @param path 待处理的路径
     * @param ext 待替换的后缀，可以包含点(.)，也可以忽略；传空字符串表示抹除后缀
     * @param standarize 是否标准化，默认true（因为不同系统上，可能会造成斜杠变化，所以默认统一标准化）
     */
    static replaceExt(path: string, ext: string, standarize: boolean = true) {
        if (!path) {
            return path;
        }
        if (ext) {
            if (!ext.startsWith('.')) {
                ext = '.' + ext;
            }
            if (path.endsWith(ext)) {
                standarize && (path = crPath.standardize(path, true));
                return path;
            }
        }
        let dir = jpath.parse(path);
        dir.base = undefined;
        dir.ext = ext;
        let ret = jpath.format(dir);
        standarize && (ret = crPath.standardize(ret, true));
        return ret;
    }
    static replaceExt2(path: string, ext: string, standardize?: boolean | AppendSlashType) {
        if (!path) {
            return '';
        }
        let slashIdx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        let dotIdx = path.indexOf('.', slashIdx + 1);
        if (dotIdx !== -1) {
            path = path.substring(0, dotIdx);
        }
        if (ext) {
            ext.startsWith('.') ? (path += ext) : (path += '.' + ext);
        }
        if (standardize !== false) {
            is_null(standardize) && (standardize = AppendSlashType.Auto);
            path = crPath.standardize(path, standardize);
        }
        return path;
    }
    /**
     * 移除给定路径的后缀
     * @param p 路径
     * @param standardize
     * @returns 去除后缀后的路径
     */
    static removeExt(p: string, standardize: boolean = true) {
        return crPath.replaceExt(p, undefined, standardize);
    }

    /**
     * 判断给定路径是否是绝对路径
     * @param p 给定路径
     * @returns 是否绝对路径
     */
    static isAbsPath(p: string) {
        if (!p) {
            return false;
        }
        return p.includes(':/') || p.includes(':\\');
    }

    /**
     * 将给定路径转化为绝对路径
     * @param path 给定路径。如果已经是绝对路径，则直接返回
     * @param needStandarized 是否标准化处理，默认true
     */
    static absPath(path: string, needStandarized?: AppendSlashType | boolean) {
        is_null(needStandarized) && (needStandarized = AppendSlashType.Never);
        if (!crPath.isAbsPath(path)) {
            let cwd = crPath.currentDirectory;
            path = crPath.join(cwd, path, false);
        }
        if (needStandarized) {
            path = crPath.standardize(path, needStandarized);
        }
        return path;
    }

    /**
     * 标准化路径
     *  @param p 路径
     * @param appendSlashStyle 后斜杠补足方式，默认AppendSlashType.Never
     * @return p的标准化格式
     */
    static standardize(p: string, appendSlashStyle?: AppendSlashType | boolean) {
        if (!p) {
            return '';
        }
        p = p.trim();
        if (p.length === 0) {
            return p;
        }
        p = p.replace(/\\/g, '/'); // \ -> /
        p = p.replace(/\/{2,}/g, '/'); // 多个斜杠连在一起，替换成一个
        if (appendSlashStyle === true || appendSlashStyle === AppendSlashType.Auto) {
            p = crPath.appendLastSlash(p, false, false);
        } else if (appendSlashStyle === AppendSlashType.Rudely) {
            p = crPath.appendLastSlash(p, true, false);
        }
        return p;
    }
    /**
     * 移除路径的前缀，包括：
     * 1. 移除开头的 / 或者 \
     * 2. 移除开头的 ./ 或者 \.
     *  @param p 
     * @param needTrim 是否需要trim，可选，默认true
     */
    static removePrefix(p: string, needTrim?: boolean) {
        if (!p) {
            return '';
        }
        if (needTrim !== false) {
            p = p.trim();
        }
        if (p.length === 0) {
            return p;
        }
        if (p[0] === '/' || p[0] === '\\') {
            p = p.substr(1);
        }
        else if (p[0] === '.' && p.length > 1) {
            if (p[1] === '/' || p[1] === '\\') {
                p = p.substr(2);
            }
        }
        return p;
    }
    /**
     * 在路径后面添加反斜杠
     *  @param p 路径
     * @param rudely 是否强制添加，默认false（默认情况下，采用自动识别，只有文件夹才在后面添加）
     * @param needStandarized 是否强制标准化，默认false
     * @return 矫正后的路径
     */
    static appendLastSlash(p: string, rudely?: boolean, needStandarized?: boolean) {
        if (!p) {
            return '';
        }
        if (needStandarized) {
            p = crPath.standardize(p, false);
        }
        if (p.length === 0) {
            return p;
        }
        let slashIdx = p.lastIndexOf('/');
        let dotIdx = p.lastIndexOf('.');
        if (slashIdx < dotIdx) {//文件
            if (rudely) {
                p = p + '/';
            }
        }
        else {//文件夹
            if (slashIdx !== p.length - 1) {
                p = p + '/';
            }
        }
        return p;
    }
    /**
     * 移除文件夹路径的最后斜杠
     *  @param p
     * @param needStandarized 是否需要标准化，默认false
     */
    static removeLastSlash(p: string, needStandarized?: boolean) {
        if (!p) {
            return p;
        }
        if (needStandarized) {
            p = crPath.standardize(p);
        }
        if (p[p.length - 1] === '/') {
            return p.substr(0, p.length - 1);
        }
        return p;
    }
    /**
     * 获取父路径
     * @param standardize 是否标准化，默认false
     */
    static getParentFolder(p: string, standardize?: boolean | AppendSlashType) {
        let dir = jpath.parse(p);
        if (standardize) {
            return crPath.standardize(dir.dir, standardize);
        }
        return dir.dir;
    }
    /**
     * 获取给定路径的根文件夹名
     *  @param p 
     */
    static getRootFolder(p: string) {
        if (!p) {
            return '';
        }
        let idx0 = p.indexOf('/');
        let idx1 = p.indexOf('\\');
        let slashIdx = Math.min(idx0 === -1 ? p.length : idx0, idx1 === -1 ? p.length : idx1);
        if (slashIdx === p.length) {
            return '';
        }
        return p.substr(0, slashIdx);
    }
    /**
     * 连接路径
     *  @param parentPath 父路径
     *  @param p 子路径
     * @param {boolean|mini_util.AppendSlashType} standarizeStyle 是否需要标准化，默认true
     * @return {string} 最终路径
     */
    static join(parentPath: string, p: string, standarizeStyle?: AppendSlashType | boolean) {
        parentPath || (parentPath = '');
        p || (p = '');
        p = jpath.join(parentPath, p);
        if (standarizeStyle !== false) {
            p = crPath.standardize(p, standarizeStyle);
        }
        return p;
    }
    /**
     * 连接web路径
     *  @param rootUrl 
     *  @param p 
     * @returns {string}
     */
    static joinWeb(rootUrl: string, p: string) {
        rootUrl = rootUrl.replace(/\\/g, '/'); // \ -> /
        rootUrl = crPath.appendLastSlash(rootUrl, true, false);
        p = crPath.standardize(p, AppendSlashType.Never);
        p = crPath.removePrefix(p, false);
        return rootUrl + p;
    }
    /**
     * 判断给定路径是否存在
     *  @param p
     * @return {boolean}
     */
    static exists(p: string) {
        return fs.existsSync(p);
    }
    /**
     * 判断给定路径是否是文件夹
     *  @param p
     * @return {boolean}
     */
    static isDir(p) {
        if (!crPath.exists(p)) {
            return false;
        }
        let state = fs.statSync(p);
        return state.isDirectory();
    }
    /**
     * 判断给定路径是否是文件
     *  @param p
     * @return {boolean}
     */
    static isFile(p: string) {
        if (!crPath.exists(p)) {
            return false;
        }
        let state = fs.statSync(p);
        return state.isFile();
    }
    /**
     * 获取给定文件的字节大小
     *  @param p 文件路径
     * @return {number} 文件大小(字节数)，如果不是文件，返回0
     */
    static fileLen(p: string) {
        if (!crPath.exists(p)) {
            return 0;
        }
        let state = fs.statSync(p);
        if (state.isFile()) {
            return state.size;
        }
        return 0;
    }
    /**
     * 为给定路径创建父文件夹
     */
    static createParentFolder(p: string) {
        let pp = crPath.getParentFolder(p);
        if (!pp) {
            return true;
        }
        return crPath.createFolder(pp);
    }
    /**
     * 创建给定文件夹
     *  @param p 路径
     * @param recursively 是否递归创建整个路径，默认true
     * @return success
     */
    static createFolder(p: string, recursively?: boolean) {
        try {
            if (!p) {
                return true;
            }
            if (fs.existsSync(p)) {
                return true;
            }
            if (recursively !== false && !crPath.createFolder(jpath.dirname(p))) {
                console.log('create folder failed', p);
                return true;
            }
            fs.mkdirSync(p);
            return true;
        }
        catch (e) {
            console.error('create folder error: \n', e);
            return false;
        }
    }
    /**
     * 拷贝文件
     *  @param from
     *  @param to
     * @param depressLog 是否抑制普通日志，默认false
     * @return success
     */
    static copyFile(from: string, to: string, depressLog?: boolean) {
        let pp = crPath.getParentFolder(to);
        if (!crPath.createFolder(pp)) {
            console.error('create parent folder failed', pp, to);
            return false;
        }
        try {
            fs.copyFileSync(from, to);
            if (!depressLog) {
                console.log(`copy file success: ${from} -> ${to}`);
            }
            return true;
        }
        catch (e) {
            console.error('copy file error: \n', e);
            return false;
        }
    }
    /**
     * 拷贝文件(夹)
     *  @param from
     *  @param to
     * @param depressLog 是否抑制普通日志，默认false
     * @return 是否成功
     */
    static copy(from: string, to: string, depressLog?: boolean) {
        try {
            if (!fs.existsSync(from)) {
                console.error('copy failed: source not exist', from);
                return false;
            }
            let state = fs.statSync(from);
            if (!state.isDirectory()) {
                return crPath.copyFile(from, to, depressLog);
            }
            if (!depressLog) {
                console.log('copy', from, '->', to);
            }
            let relatives = [''];
            let idx = 0;
            while (idx < relatives.length) {
                let relativeDir = relatives[idx++];
                let fromFolder = jpath.join(from, relativeDir);
                let toFolder = jpath.join(to, relativeDir);
                if (!crPath.createFolder(toFolder, relativeDir ? false : true)) {
                    return false;
                }
                fs.readdirSync(fromFolder).forEach(function (item) {
                    let relativeItem = jpath.join(relativeDir, item);
                    let absFrom = jpath.join(fromFolder, item);
                    let absTo = jpath.join(toFolder, item);
                    if (fs.statSync(absFrom).isDirectory()) {
                        relatives.push(relativeItem);
                    } else {
                        fs.copyFileSync(absFrom, absTo);
                        if (!depressLog) {
                            console.log(`copy file success: ${absFrom} -> ${absTo}`);
                        }
                    }
                });
            }
            return true;
        } catch (e) {
            console.log('copy error: \n', e);
            return false;
        }
    }

    /**
     * 拷贝所有
     * @param copies 拷贝列表，每个元素是：{from, to}
     * @return 是否完成
     */
    static copyAll(copies: { from: string, to: string }[]) {
        if (!copies) {
            return true;
        }
        for (let c of copies) {
            if (!crPath.copy(c.from, c.to)) {
                return false;
            }
        }
        return true;
    }

    /**
     * 移动文件（夹）
     *  @param from 源文件(夹)
     *  @param to 目标文件(夹)
     *  @param depressLog 是否抑制普通日志，默认false
     */
    static move(from: string, to: string, depressLog?: boolean) {
        if (from === to) {
            if (!depressLog) {
                console.log('no need move path: ', from);
            }
            return true;
        }
        if (!crPath.copy(from, to, true)) {
            return false;
        }
        if (!crPath.delete(from)) {
            crPath.delete(to);
            return false;
        }
        if (!depressLog) {
            console.log('move path success: ', from, '->', to);
        }
        return true;
    }

    /**搜集给定文件夹下符合条件的文件列表（一些怪异文件自动忽略）
     *  @param folder 要搜集的文件夹目录 
     * @param patterns 文件类型列表，不填表示所有文件
     * @param recursively 是否递归遍历，默认false
     * @param relatived 是否返回相对路径（相对folder的路径），默认false
     * @param outFiles 用于返回的数组，不填就返回一个新数组
     * @return 文件路径数组
     */
    static collectGoodFiles(folder: string, patterns?: string | string[], recursively?: boolean, relatived?: boolean, outFiles?: string[]) {
        outFiles || (outFiles = []);
        crPath.traverseGoodFile(folder, patterns, recursively, function (path, relativePath, fileName) {
            if (relatived === true) {
                outFiles.push(relativePath);
            }
            else {
                outFiles.push(path);
            }
        });
        return outFiles;
    }

    /**搜集给定文件夹下符合条件的文件列表
     *  @param folder 要搜集的文件夹目录 
     * @param patterns 文件类型(列表)，不填表示所有文件
     * @param {boolean} recursively 是否递归遍历，默认false
     * @param {boolean} relatived 是否返回相对路径（相对folder的路径），默认false
     * @param {string[]} outFiles 用于返回的数组，不填就返回一个新数组
     * @return {string[]} 文件路径数组
     */
    static collectFiles(folder: string, patterns?: string | string[], recursively?: boolean, relatived?: boolean, outFiles?: string[]) {
        outFiles || (outFiles = []);
        crPath.traverseFile(folder, patterns, recursively, function (path, relativePath, fileName) {
            if (relatived === true) {
                outFiles.push(relativePath);
            }
            else {
                outFiles.push(path);
            }
        });
        return outFiles;
    }

    /**遍历给定路径的所有文件（一些怪异的文件会自动忽略）
     *  @param folder 文件夹路径
     * @param {string[]|string} patterns 文件类类型或者类型列表，不填表示所有文件
     * @param {boolean} recursively 是否递归，默认false
     * @param callback 遍历回调，回调返回false表示退出遍历
     * @return {boolean} 没有出错返回true
     */
    static traverseGoodFile(folder: string, patterns?: string | string[], recursively?: boolean, callback?: (filePath: string, relativePath: string, fileName: string) => any | false) {
        return crPath.traverseFile(folder, patterns, recursively, (fpath, rpath, fname) => {
            if (fname.startsWith('.') || fname.startsWith('~$')) {
                console.log('ignore', fpath);
                return;
            }
            return callback(fpath, rpath, fname);
        });
    }

    /**遍历给定路径的所有文件
     * @param rootFolder 文件夹路径
     * @param patterns 文件类类型或者类型列表，不填表示所有文件
     * @param recursively 是否递归，默认false
     * @param callback 遍历回调，回调返回false表示退出遍历
     * @return 没有出错返回true
     */
    static traverseFile(rootFolder: string, patterns?: string | string[], recursively?: boolean, callback?: (filePath: string, relativePath: string, fileName: string) => any | false) {
        if (patterns) {
            if (typeof patterns === 'string') {
                patterns = [patterns];
            }
            for (let i = 0; i < patterns.length; ++i) {
                patterns[i] = patterns[i].toLowerCase();
            }
        }
        let fileRelativePaths = [];
        let fileNames = [];
        rootFolder = crPath.standardize(rootFolder, AppendSlashType.Rudely);
        if (!crPath.collectSubs(rootFolder, undefined, fileRelativePaths, fileNames, recursively, true)) {
            return false;
        }
        for (let i = 0; i < fileRelativePaths.length; ++i) {
            let fileName = fileNames[i];
            let fileRelativePath = fileRelativePaths[i];
            let filePath = rootFolder + fileRelativePath;
            let fit = true;
            if (patterns) {
                fit = false;
                for (let p of patterns) {
                    if (fileName.toLowerCase().endsWith(p)) {
                        fit = true;
                        break;
                    }
                }
            }
            if (fit) {
                if (false === callback(filePath, fileRelativePath, fileName)) {
                    break;
                }
            }
        }
        return true;
    }

    /**
     * 遍历给定文件夹里的子元素（文件或者文件夹）
     *  @param folder 
     * @param {(relativePath: string, isFolder:boolean) =>any} callback 如果回调函数返回false，则认为退出遍历
     * @returns {boolean} 出错返回false，否则返回true
     */
    static traverseFD(folder: string, callback: (relativePath: string, isFolder: boolean) => any | false) {
        return crPath.traverseSubs(folder, false, true, callback);
    }

    /**
     * 遍历给定文件夹里的子元素（文件或者文件夹）
     *  @param rootFolder 
     * @param {boolean} recursively 是否递归，默认false
     * @param {boolean} relatived 是否返回相对folder的路径，默认false
     * @param {(path: string, isFolder:boolean) =>any} callback 如果回调函数返回false，则认为退出遍历
     * @returns {boolean} 出错返回false，否则返回true
     */
    static traverseSubs(rootFolder: string, recursively?: boolean, relatived?: boolean, callback?: (path: string, isFolder: boolean) => any | false) {
        let files = [];
        let folders = [];
        if (!this.collectSubs(rootFolder, folders, files, undefined, recursively, relatived)) {
            return false;
        }
        for (let folder of folders) {
            if (callback(folder, true) === false) {
                return true;
            }
        }
        for (let file of files) {
            if (callback(file, false) === false) {
                return true;
            }
        }
        return true;
    }

    /**
     * 搜集给定文件夹里的所有子文件和子文件夹
     *  @param rootFolder 目标文件夹
     * @param {string[]} subFolders 用于返回的子文件夹数组，填undefined表示不需要返回子文件夹列表
     * @param {string[]} subFiles 用于返回的子文件数组，填undefined表示不需要返回子文件列表
     * @param {string[]} subFilenames 用于返回的子文件名称数组，填undefined表示不需要返回子文件名称列表
     * @param {boolean} recursively 是否递归搜集所有的子文件夹或者子文件，默认false
     * @param {boolean} relatived 返回的子文件和文件夹是否是相对rootFolder的路径，默认false
     * @returns {boolean} 是否成功搜集
     */
    static collectSubs(rootFolder: string, subFolders?: string[], subFiles?: string[], subFilenames?: string[], recursively?: boolean, relatived?: boolean) {
        rootFolder = crPath.standardize(rootFolder, AppendSlashType.Rudely);
        if (!fs.existsSync(rootFolder)) {
            //不存在
            return true;
        }
        try {
            let state = fs.statSync(rootFolder);
            if (!state.isDirectory()) {
                //一个文件
                return false;
            }
            if (!recursively) {
                //不递归
                fs.readdirSync(rootFolder).forEach(function (item) {
                    let sub = jpath.join(rootFolder, item);
                    let relativePath = relatived === true ? item : sub;
                    let subState = fs.statSync(sub);
                    if (subState.isDirectory()) {
                        subFolders && subFolders.push(crPath.standardize(relativePath, AppendSlashType.Rudely));
                    } else {
                        subFiles && subFiles.push(crPath.standardize(relativePath, AppendSlashType.Never));
                        subFilenames && subFilenames.push(item);
                    }
                });
                return true;
            }
            //文件夹。以下代码不再采用递归方式（在资源特别多的情况下会有堆栈溢出的问题）
            let folders = [rootFolder];
            subFolders || (subFolders = []);
            let idx = 0;
            let dstStartIdx = subFolders.length;
            while (idx < folders.length) {
                let folder = folders[idx];
                let dstFolder = folder;
                if (relatived === true) {
                    dstFolder = idx === 0 ? '' : subFolders[dstStartIdx + idx - 1];
                }
                ++idx;
                fs.readdirSync(folder).forEach(function (item) {
                    let sub = jpath.join(folder, item);
                    let relativePath = jpath.join(dstFolder, item);
                    let subState = fs.statSync(sub);
                    if (subState.isDirectory()) {
                        folders.push(crPath.standardize(sub, AppendSlashType.Rudely));
                        subFolders.push(crPath.standardize(relativePath, AppendSlashType.Rudely));
                    } else {
                        subFiles && subFiles.push(crPath.standardize(relativePath, AppendSlashType.Never));
                        subFilenames && subFilenames.push(item);
                    }
                });
            }
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }

    /**
     * 清理文件夹所有内容，但不删除文件夹本身
     */
    static clearFolder(p: string) {
        return crPath.delete(p, true);
    }

    /**
     * 删除文件或者文件夹
     *  @param p 路径
     * @param {boolean} ignoreThis 是否忽略path本身，可选，默认不忽略
     * @param {boolean} depressLog 是否抑制普通日志，默认false
     */
    static delete(p: string, ignoreThis?: boolean, depressLog?: boolean) {
        if (!fs.existsSync(p)) {
            //不存在
            return true;
        }
        try {
            let state = fs.statSync(p);
            if (!state.isDirectory()) {
                //一个文件
                if (ignoreThis !== true) {
                    //不忽略就删除
                    fs.unlinkSync(p);
                    depressLog || console.log('delete file:', p);
                }
                return true;
            }
            //文件夹。以下代码不再采用递归删除方式（在资源特别多的情况下会有堆栈溢出的问题）
            let folders = [p];
            let files = [];
            let idx = 0;
            while (idx < folders.length) {
                let folder = folders[idx++];
                fs.readdirSync(folder).forEach(function (item) {
                    let sub = jpath.join(folder, item);
                    let subState = fs.statSync(sub);
                    if (subState.isDirectory()) {
                        folders.push(sub);
                    } else {
                        files.push(sub);
                    }
                });
            }
            for (let file of files) {
                fs.unlinkSync(file);
            }
            let end = ignoreThis === true ? 1 : 0;
            for (idx = folders.length - 1; idx >= end; --idx) {
                fs.rmdirSync(folders[idx]);
            }
            depressLog || console.log('delete folder:', p);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }
    /**
     * 删除文件（夹）列表
     * @param paths 待删除的文件（夹）列表
     * @return 删除是否成功
     */
    static deleteAll(paths: string[]) {
        if (!paths) {
            return true;
        }
        for (let p of paths) {
            if (!crPath.delete(p)) {
                return false;
            }
        }
        return true;
    }
}