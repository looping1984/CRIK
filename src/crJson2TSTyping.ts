import { crUtil } from "./crUtil";

const s_entry_template = `
//自动生成，请勿手动更改 
export type @{Types};
`;

/**
 * 任何一个js对象节点，都可以配置一个meta节点，指导typescript代码生成的声明格式
 */
const c_js_cfg_meta_key = '__ts_meta__';

/**
 * 具体的meta格式  
 * 例如：
 * ```js
 * const path = require('path');
 *     __ts_meta__: {
 *      deep: 2,
 *        map: {
 *           keyType: 'number',
 *          sample: 'task',
 *       },
 *   },
 * ```
 */
export type JSCfgMetaSt = {
    /**
     * 当前对象暴力替换成replace代表的声明，比如 'any'
     */
    replace?: string;
    /**
     * 当前对象是否自由化key（ts代码使用时可以用任意给定类型的key访问而不会报错）
     *  * false: 不自由，必须是声明里的key，默认
     *  * true: 自由key，附加声明：[key: string] :any
     *  * {keyType, valueType}: 自由key，附加声明: [key: keyType]:valueType
     */
    keyFree?: boolean | { keyType?: string, valueType?: string };
    /**
     * 追加ts类型声明深度，默认对每个全局配置，都只扫描到它的第一级子节点即可；支持负数
     */
    deep?: number,
    /**
     * meta所作用的当前对象，是否应该看成是一个key-value键值对的map容器，默认false  
     *  * true：看成map容器，它的第一个子节点作为value的类型样例生成类型声明，容器key的类型默认为string  
     *  * 字符串：表示看成map容器，字符串所表示的子节点作为value的类型样例生成类型声明，容器key的类型默认为string  
     *  * {keyType, sample} 结构：看成map容器，sample所表示的子节点作为容器value的类型样例生成类型声明，keyType作为容器key的类型，一般都是string或者number  
     */
    map?: boolean | string | { keyType?: string, sample?: string };
}

/**
 * 解析js object对象并生成Typescript类型声明
 */
export class crJson2TSTyping {
    /**
     * 通过从js扫描的json对象生成ts interface
     * @param jObjects json对象
     * @param entryName 根对象名称
     * @param options 生成代码的选项，可选
     * @returns ts类型声明源代码
     */
    static genTypes(jObjects: any, entryName: string, options?: { entry_template?: string, indent?: string, deep?: number }): string {
        let entry_template = options && options.entry_template || s_entry_template;
        let indent = options && options.indent || '    ';
        let deep = options && options.deep || 2;
        let source = crJson2TSTyping._genNodeTypes(jObjects, entryName, {
            curIndent: '',
            curDeep: 0,
            maxDeep: deep,
            defaultIndent: indent,
            defaultMaxDeep: deep,
        });
        let ret = entry_template.replace('@{Types}', source);
        return ret;
    }

    private static _genNodeTypes(obj: any, name: string, options: _TypeGenOption): string {
        let spliter = options.curDeep === 0 ? '=' : ':';
        //object
        if (crUtil.isObject(obj)) {
            let maxDeep = options.maxDeep;
            let replaceType: string;
            let freeKeyKeyType: string;
            let freeKeyValueType: string;
            let mapSample: any;
            let mapKeyType: string;
            let meta: JSCfgMetaSt = obj[c_js_cfg_meta_key];
            if (meta) {
                delete obj[c_js_cfg_meta_key];
                maxDeep += (meta.deep || 0);
                replaceType = meta.replace;
                if (meta.keyFree) {
                    freeKeyValueType = 'any';
                    if (meta.keyFree === true) {
                        freeKeyKeyType = 'string';
                    } else {
                        freeKeyKeyType = meta.keyFree.keyType || 'string';
                        freeKeyValueType = meta.keyFree.valueType || 'any';
                    }
                }
                if (meta.map) {
                    let mapKey: string;
                    if (typeof meta.map === 'string') {
                        mapKey = meta.map;
                        mapKeyType = 'string';
                    } else if (typeof meta.map === 'boolean') {
                        mapKey = '';
                        mapKeyType = 'string';
                    } else {
                        mapKeyType = meta.map.keyType || 'string';
                        mapKey = meta.map.sample || '';
                    }
                    mapSample = obj[mapKey];
                    if (!mapSample) {
                        for (let key in obj) {
                            mapSample = obj[key];
                            break;
                        }
                    }
                }
            }
            if (replaceType) {
                return `${options.curIndent}${name}${spliter} ${replaceType}`;
            }
            if (options.curDeep >= maxDeep) {
                return `${options.curIndent}${name}${spliter} any`;
            }
            let str = '';
            let curIndent = options.curIndent;
            let curDeep = options.curDeep;
            let curMaxDeep = options.maxDeep;
            options.maxDeep = maxDeep;
            if (mapSample) {
                options.curDeep = curDeep + 1;
                options.curIndent = curIndent + options.defaultIndent;
                str += '\n' + crJson2TSTyping._genNodeTypes(mapSample, `[key:${mapKeyType}]`, options) + ';';
            } else {
                for (let key in obj) {
                    options.curDeep = curDeep + 1;
                    options.curIndent = curIndent + options.defaultIndent;
                    str += '\n' + crJson2TSTyping._genNodeTypes(obj[key], key, options) + ';';
                }
            }
            if (freeKeyKeyType) {
                str += '\n' + `${curIndent + options.defaultIndent}[key:${freeKeyKeyType}]: ${freeKeyValueType};`;
            }
            str && (str += '\n' + curIndent);
            options.curDeep = curDeep;
            options.curIndent = curIndent;
            options.maxDeep = curMaxDeep;
            return `${options.curIndent}${name}${spliter} {${str}}`;
        }

        //array
        if (crUtil.isArray(obj)) {
            if (options.curDeep >= options.maxDeep || obj.length === 0) {
                return `${options.curIndent}${name}${spliter} any[]`;
            }
            return crJson2TSTyping._genNodeTypes(obj[0], name, options) + '[]';
        }

        //built in
        return `${options.curIndent}${name}${spliter} ${typeof obj}`;
    }
}

type _TypeGenOption = {
    curIndent: string,
    curDeep: number,
    maxDeep: number,

    defaultIndent: string,
    defaultMaxDeep: number,
}