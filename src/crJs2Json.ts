import { crFS } from "./crFS";
import { crPath } from "./crPath";
import { is_null, not_null } from "./crUtil";

/**
 * 扫描js文件为json对象
 */
export class crJs2Json {
    /**
     * 扫描js文件夹并生成json对象集合
     * @param folders 文件夹（列表）
     * @param extents 文件后缀（列表），可选，默认.js文件
     * @param filter 自定义文件过滤函数，返回true表示该文件参与扫描，返回false表示被过滤掉。可选
     * @param outJObjects 用于输出的key-jsonObj键值对，可选
     * @param jsReader 一个自定义的js文件内容读取函数，可选，默认采用crFS.read_text
     * @returns 扫描结果，如果有错误，会在结果里显示
     */
    static scanFolder(folders: string | string[], extents?: string[] | string, filter?: (jsFullPath: string, folder: string, relativePath: string, fileName: string) => boolean, outJObjects?: Record<string, any>, jsReader?: (jsPath: string) => string): { error?: string, jobjects?: Record<string, any> } {
        if (typeof folders === 'string') {
            folders = [folders];
        }
        extents || (extents = ['.js']);
        if (typeof extents === 'string') {
            extents = [extents];
        }
        let jspaths = [];
        for (let folder of folders) {
            crPath.traverseGoodFile(folder, extents, true, (jsPath, relativePath, fileName) => {
                if (!filter || filter(jsPath, folder, relativePath, fileName)) {
                    jspaths.push(jsPath);
                }
            });
        }
        return crJs2Json.scanJs2JObject(jspaths, outJObjects, jsReader);
    }

    /**
     * 扫描给定js文件
     * @param jsPaths js文件路径列表
     * @param outJObjects 用于输出的key-jsonObj键值对，可选
     * @param jsReader 一个自定义的js文件内容读取函数，可选，默认采用crFS.read_text
     * @returns 扫描结果，如果有错误，会在结果里显示
     */
    static scanJs2JObject(jsPaths: string[], outJObjects?: Record<string, any>, jsReader?: (jsPaht: string) => string): { error?: string, jobjects?: Record<string, any> } {
        jsReader || (jsReader = crFS.read_text);
        _Helper.pushGlobals();
        let error: string = undefined;
        for (let jspath of jsPaths) {
            let source = jsReader(jspath);
            if (!source) {
                error = `read js source failed: ${jspath}`;
                break;
            }
            try {
                source = source.replace(/\blet\b/g, 'var');
                var geval = eval; //将eval赋值给一个临时变量再调用，这个很重要，具体原因忘记了，好像是会造成执行后的全局变量存的位置不对
                geval(source);
            } catch (e) {
                error = `eval js source error: ${jspath}\n${e}`;
                break;
            }
        }
        return _Helper.popGlobals(error, outJObjects);
    }

    /**
     * 解析给定js源代码为json对象
     * @param jsSource js源代码
     * @param outJObjects 用于返回的对象，可选
     * @returns 解析该源代码的对象列表（因为一个文件可能有多个全局对象），失败会有相应返回
     */
    static parseSource(jsSource: string, outJObjects?: Record<string, any>): { error?: string, jobjects?: Record<string, any> } {
        _Helper.pushGlobals();
        let error: string;
        try {
            jsSource = jsSource.replace(/\blet\b/g, 'var');
            var geval = eval; //将eval赋值给一个临时变量再调用，这个很重要，具体原因忘记了，好像是会造成执行后的全局变量存的位置不对
            geval(jsSource);
        } catch (e) {
            error = `eval js source error: \n${e}`;
        }
        return _Helper.popGlobals(error, outJObjects);
    }
}

class _Helper {
    private static s_preGlobals: any;
    static pushGlobals() {
        _Helper.s_preGlobals = _Helper.collectGlobals();
    }
    static popGlobals(error?: string, outJObjects?: Record<string, any>): { error?: string, jobjects?: Record<string, any> } {
        let preGlobals = _Helper.s_preGlobals;
        _Helper.s_preGlobals = undefined;
        let g_global = _Helper.g_global;
        if (error) {
            let keys = _Helper.diffKeys(preGlobals, g_global);
            _Helper.deleteKeys(g_global, keys);
            return {
                error: error,
                jobjects: outJObjects,
            };
        }
        let cfgObjs = {};
        let keys = _Helper.diffKeys(preGlobals, g_global);
        _Helper.merge(cfgObjs, g_global, keys);
        _Helper.deleteKeys(g_global, keys);
        if (outJObjects) {
            let keys = _Helper.diffKeys({}, cfgObjs);
            let existKeys = _Helper.containKeys(outJObjects, keys);
            if (existKeys) {
                error = 'existed g_global cfgs: ' + existKeys.join(' ');
                return {
                    error: error,
                    jobjects: outJObjects,
                };
            }
            _Helper.merge(outJObjects, cfgObjs, keys);
        } else {
            outJObjects = cfgObjs;
        }
        return {
            error: undefined,
            jobjects: outJObjects,
        };
    }

    static get g_global() {
        return global || window || {};
    }
    static collectGlobals(): any {
        let g_global = global || window || {};
        let preGlobals = {};
        for (let key in g_global) {
            preGlobals[key] = true;
        }
        preGlobals['window'] = true;
        return preGlobals;
    }
    static merge(dst: any, src: any, keys: string[]) {
        for (let key of keys) {
            dst[key] = src[key];
        }
    }
    static containKeys(obj: any, keys: string[]): string[] {
        let ret: string[] = undefined;
        for (let key of keys) {
            if (not_null(obj[key])) {
                (ret || (ret = [])).push(key);
            }
        }
        return ret;
    }
    static diffKeys(old: any, cur: any): string[] {
        let ret = [];
        for (let key in cur) {
            if (not_null(cur[key]) && is_null(old[key])) {
                ret.push(key);
            }
        }
        return ret;
    }
    static deleteKeys(obj: any, keys: string[]) {
        for (let key of keys) {
            delete obj[key];
        }
    }
}