import { crUtil, is_null } from "./crUtil";

/**
 * 任何一个js对象节点，都可以配置一个meta节点，指导敏感扫描方式
 */
const c_sensitive_meta_key = '__sensitive_meta__';

/**
 * 版署敏感节点meta格式
 */
type _SensitiveMeta = {
    /**
     * 扫描的忽略方式
     * true: 当前节点及其子节点全部忽略
     * false: 不忽略，默认
     * string: 忽略某个一级子节点
     * string[]: 忽略多个一级子节点
     */
    ignore?: boolean | string | string[];
};

/**
 * 敏感判断返回结果
 */
export enum crSensitiveCheckRet {
    /**
     * 是敏感内容
     */
    Sensitive = 0,
    /**
     * 本次判断通过（可以进行下一判断）
     */
    Pass = 1,
    /**
     * 本次判断通过并强制跳过后续判断
     */
    Ignore = 2,
}

/**
 * 敏感词判断函数接口
 */
export interface crSensitiveCheckFunction {
    /**
     * @param content 待判断的内容
     * @param options 扫描参数
     * @param parentPath json里父节点路径
     * @param nodeName 当前节点名称
     * @param index （如果是当前节点是一个数组）当前节点的第几个数组元素，undefined则表示不是数组元素
     */
    (content: string, options: crSensitiveScanOptions, parentPath: string[], nodeName: string, index?: number): crSensitiveCheckRet;
};

/**
 * 版署扫描可选项
 */
export interface crSensitiveScanOptions {
    /**
     * 自定义敏感判断函数列表，可选，默认采用系统设定的判断方式
     */
    checks?: crSensitiveCheckFunction[],
    /**
     * 敏感数据的输出回调，可选，默认往控制台输出
     */
    output?: (sensitiveContent: string, parentPath: string[], nodeName: string, index?: number) => any;
    /**
     * 其它自定义透传数据
     */
    [key: string | number]: any;
}

/**
 * 版署敏感内容扫描工具
 */
export class crSensitiveScanner {
    /**
     * 默认提供的敏感判断函数
     */
    static readonly Sensitives = {
        /**
         * 敏感判断函数：判断给定文本是否包含英文
         * @param content 待判断的内容
         */
        englishCheck: function (content: string) {
            for (let i = 0; i < content.length; ++i) {
                let c = content.codePointAt(i);
                if (c >= 65 && c <= 90 || c >= 97 && c <= 122) {
                    if (c === 88 || c === 120) {
                        //x可能用来表示乘号（倍数）
                        continue;
                    }
                    if (c === 110) {
                        //n
                        if (i > 0 && content.codePointAt(i - 1) === 92) {
                            // \n
                            continue;
                        }
                    }
                    return crSensitiveCheckRet.Sensitive;
                }
            }
            return crSensitiveCheckRet.Pass;
        },
        defaultCheck: function (content: string) {
            let meetLeft = false;
            let begin = 0;
            let idx = 0;
            while (idx < content.length) {
                let c = content[idx];
                if (meetLeft) {
                    if (c === '>') {
                        begin = idx + 1;
                    }
                    ++idx;
                } else {
                    if (c === '<') {
                        if (crSensitiveScanner.Sensitives.englishCheck(content.substring(begin, idx)) === crSensitiveCheckRet.Sensitive) {
                            return crSensitiveCheckRet.Sensitive;
                        }
                        meetLeft = true;
                    }
                    ++idx;
                }
            }
            if (idx > begin) {
                content = (begin === 0 && idx === content.length) ? content : content.substring(begin, idx);
                return crSensitiveScanner.Sensitives.englishCheck(content);
            }
            return crSensitiveCheckRet.Pass;
        },
        specialCheck: function (content: string) {
            if (content.includes('://')) {
                //url地址
                return crSensitiveCheckRet.Ignore;
            }
            if (content.search(/\/.*?\//g) !== -1 || content.search(/\/.*?\./g) !== -1) {
                //maybe path
                return crSensitiveCheckRet.Ignore;
            }
            if (content.startsWith('#') && content.length <= 8 && content.length >= 6) {
                //maybe color
                return crSensitiveCheckRet.Ignore;
            }
            return crSensitiveCheckRet.Pass;
        },
    };

    /**
     * 扫描给定json对象，是否有版署敏感内容
     * @param jsonObj 待扫描的对象
     * @param options 扫描可选项，可选
     * @returns 扫描到的敏感内容总数量，没有就返回0
     */
    static scanJObject(jsonObj: any, options?: crSensitiveScanOptions): number {
        options || (options = {});
        options.output || (options.output = (sensitiveContent, parentPath, nodeName, index) => {
            if (is_null(index)) {
                console.log(`[sensitive] ${parentPath.join('.')}.${nodeName}: ${sensitiveContent}`);
            } else {
                console.log(`[sensitive] ${parentPath.join('.')}.${nodeName}[${index}]: ${sensitiveContent}`);
            }
        });
        if (!options.checks) {
            options.checks = [crSensitiveScanner.Sensitives.specialCheck, crSensitiveScanner.Sensitives.defaultCheck];
        }
        return crSensitiveScanner._scanJObject(options, jsonObj, [], '<root>');
    }

    private static _scanJObject(options: crSensitiveScanOptions, jsonObj: any, parentPath: string[], nodeName: string, index?: number): number {
        if (!jsonObj) {
            return 0;
        }
        //普通文本
        if (typeof jsonObj === 'string') {
            for (let check of options.checks) {
                let ret = check(jsonObj, options, parentPath, nodeName, index);
                if (ret === crSensitiveCheckRet.Sensitive) {
                    //敏感内容
                    options.output(jsonObj, parentPath, nodeName, index);
                    return 1;
                }
                if (ret === crSensitiveCheckRet.Ignore) {
                    //直接跳过
                    return 0;
                }
                //继续判断
            }
            //无敏感信息
            return 0;
        }

        //普通Object
        if (crUtil.isObject(jsonObj)) {
            let meta: _SensitiveMeta = jsonObj[c_sensitive_meta_key];
            let ignores: string[];
            if (meta && meta.ignore) {
                if (meta.ignore === true) {
                    return 0;
                }
                if (typeof meta.ignore === 'string') {
                    ignores = [meta.ignore];
                } else if (crUtil.isArray(meta.ignore)) {
                    ignores = meta.ignore;
                }
            }
            parentPath.push(nodeName);
            let num = 0;
            for (let key in jsonObj) {
                if (ignores && ignores.includes(key)) {
                    continue;
                }
                num += crSensitiveScanner._scanJObject(options, jsonObj[key], parentPath, key);
            }
            parentPath.pop();
            return num;
        }

        //数组
        if (crUtil.isArray(jsonObj)) {
            let num = 0;
            for (let i = 0; i < jsonObj.length; ++i) {
                num += crSensitiveScanner._scanJObject(options, jsonObj[i], parentPath, nodeName, i);
            }
            return num;
        }

        //其它
        return 0;
    }
}