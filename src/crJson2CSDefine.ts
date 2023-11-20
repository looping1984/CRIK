import { crUtil, is_null, not_null } from "./crUtil";

export interface IJ2CSParseInfo {
    /**
     * 当前待解析的对象名称
     */
    readonly targetName: string;
    /**
     * 当前待解析的对象
     */
    readonly target: any;
    /**
     * 当前对象的meta
     */
    readonly meta?: CSCfgMetaSt;
    /**
     * 父节点
     */
    parent?: _ParseStackInfo;
}

export interface IJ2CSParseHookRet {
    /**
     * 当前对象是否直接替换为指定类型。可选，默认不替换
     */
    replace?: string;
}

/**
 * 参数选项
 */
export type Json2CSOptions = {
    /**
     * 模板，生成的最终代码会嵌入到该模板字符串里的 '@{output}'里。可选，默认{@link s_entry_template}
     */
    template?: string;
    /**
     * 首行的缩进，默认0
     */
    headLineIndent?: number;
    /**
     * 代码默认的初始缩进，默认0
     * @note 第一行代码使用 {@link headLineIndent}
     */
    initIndent?: number;
    /**
     * 代码结构的indent空格数，可选。默认4
     */
    indent?: number;
    /**
     * 解析json的深度，0表示不解析，只返回struct entryName{}；1表示只解析给定js对象的第一层，-1表示全部解析。默认-1
     */
    deep?: number;
    /**
     * any类型的类名
     */
    typeNameOfAny?: string;
    /**
     * 数组的类型名称
     */
    typeNameOfList?: string;
    /**
     * 字典的类型名称
     */
    typeNameOfMap?: string;
    /**
     * key为string的字典类型名称（只有一个TValue的泛型参数）
     */
    typeNameOfStringMap?: string;

    /**
     * 一个回调函数，在解析每个配置对象时，都会回调。如果有返回值，则根据返回值信息来处理该节点
     * @param parseInfo 当前解析信息
     * @returns 拦截的自定义信息，可选。可以返回undefined
     */
    parseHook?: (parseInfo: IJ2CSParseInfo) => IJ2CSParseHookRet | undefined | void;
};


/**
 * meta的描述
 */
const s_meta_describe = `json转C#代码定义，当前仅支持以下类型：
1. 内建型: bool, string, int, float, long
2. 数组：[]
3. 字典：Dictionary<int, XXX>, Dictionary<string, XXX>
4. 未知类型（任意类型）：object
5. 复杂结构体：struct {}
6. 具名类型（自定义类型名）
如果一个json节点中包含meta信息（字段为 _cs_meta_），则当前节点的转化受该meta信息影响。
meta信息是一个对象，它可以包含两个字段：
replace: （可选），如果填了该字段，则当前节点的类型强制变为replace对应的字符串代码的自定义类型（具名类型） 
map: （可选）。有三种填写方式：
     true： 表示当前节点看成一个字典对象，字符串作为该字典的key类型，字典的value类型自动扫描得到；
     字符串：表示当前节点看成一个字典对象，字符串作为该字典的key类型，map对应的字符串代表当前节点的一个字段名称，工具会将该字段数据对应的类型作为整个字典的value类型；
     {keyType: 'string'|'int', sample: string}：表示当前节点看成一个字典对象，keyType表示的值作为该字典的key类型（只有字符串和int两种选项）；sample数值对应的节点字段数据的类型作为字典的valu类型
`;

const s_entry_template = `
//自动生成，请勿手动更改 
/**
 ${s_meta_describe}
 */
@{output}
`;

/**
 * 任何一个js对象节点，都可以配置一个meta节点，指导cs代码生成的声明格式
 */
const c_js_cfg_meta_key = '_cs_meta_';
/**
 * 具体的meta格式  
 */
type CSCfgMetaSt = {
    /**
     * 如果节点是一个数组，填了该字段，说明整个数组被暴力替换为replaceAry代码的类型，一般是由数组字段的父节点指定
     */
    replaceAry?: string;
    /**
     * 当前对象暴力替换成replace代表的类型
     */
    replace?: string;
    /**
     * 单独定义当前对象的解析深度。0表示只保留当前对象类型本身，不再深入；1表示只解析给定js对象的第一层，-1表示全部解析。可选。默认由当前解析环境决定
     */
    deep?: number,
    /**
     * meta所作用的当前对象，是否应该看成是一个key-value键值对的map容器，默认false  
     *  * true：看成map容器，它的所有子节点的一个联合定义（超集）作为value类型，如果联合失败，整个cs代码生成终止
     *  * 字符串：表示看成map容器，字符串所表示的子节点作为value的类型样例生成类型声明，容器key的类型默认为string  
     *  * {keyType, sample, meta} 结构：看成map容器
     *  * * keyType作为容器key的类型，一般都是string或者int；
     *  * * sample所表示的子节点作为容器value的类型样例生成类型声明，如果sample不填，则采用所有子节点的联合定义，联合失败终止cs代码生成
     *  * * meta: 直接设定map容器元素的meta，可选
     */
    map?: boolean | string | { keyType?: 'string' | 'int', sample?: string, meta?: CSCfgMetaSt };
    /**
     * 直接设定一级子节点的meta。如果子节点是一个数组或者多维数组，根据meta里的信息来决定该数组或者它的元素的生成方式
     */
    children?: Record<string, CSCfgMetaSt>;
}

/**
 * 只能获取meta
 * @param obj 当前节点
 * @param fdName 要获取meta的子节点名称（字段名称）；如果传undefined或者null表示直接获取当前节点的meta；传其它则获取子节点的meta；如果当前节点是一个map，则传''获取它的元素的meta
 * @param meta obj已有的meta，可选，不填则直接到obj里获取（如果obj里有，则obj自带的优先）
 * @returns 如果有meta则返回，否则返回undefined
 */
function _GetMeta(obj: any, fdName?: string, meta?: CSCfgMetaSt) {
    let objIsObj = crUtil.isObject(obj);
    if (objIsObj) {
        //优先用obj自己的meta
        meta = obj[c_js_cfg_meta_key] || meta;
    }
    if (!crUtil.isObject(meta)) {
        //meta是无效的
        meta = undefined;
    }

    //不获取子节点的meta
    if (is_null(fdName)) {
        return meta;
    }

    //以下需要获取子节点meta
    if (!meta) {
        //直接获取子节点meta
        if (objIsObj) {
            meta = _GetMeta(obj[fdName], undefined, undefined);
        }
        return meta;
    }

    if (meta.map) {
        //obj被看成是一个字典
        let sample: string;
        let elmMeta: CSCfgMetaSt;
        if (typeof meta.map === 'string') {
            sample = meta.map;
        } else if (crUtil.isObject(meta.map)) {
            sample = meta.map['sample'];
            elmMeta = meta.map['meta'];
        }
        if (sample && objIsObj) {
            elmMeta = _GetMeta(obj[sample], undefined, elmMeta);
        }
        meta = elmMeta;
    } else if (objIsObj) {
        meta = _GetMeta(obj[fdName], undefined, crUtil.isObject(meta.children) ? meta.children[fdName] : undefined);
    } else {
        meta = undefined;
    }
    return meta;
}


class _ParseStackInfo implements IJ2CSParseInfo {
    /**
     * 当前待解析的对象名称
     */
    targetName: string;
    /**
     * 当前待解析的对象
     */
    target: any;
    /**
     * 当前对象的meta
     */
    meta?: CSCfgMetaSt;
    /**
     * 生成当前对象需要的indent
     */
    headIndent: number;

    /**
     * 当前indent
     */
    indent: number;
    /**
     * 解析深度
     */
    deep: number;

    /**
     * 父节点
     */
    parent?: _ParseStackInfo;
    /**
     * 栈池
     */
    _stackPool?: _ParseStackInfo[];
};

/**
 * 解析js object对象并生成Typescript类型声明
 */
export class crJson2CSDefine {
    /**
     * 通过从js扫描的json对象生成c#结构体定义
     * @param jobject json对象
     * @param entryName 根对象名称
     * @param options 生成代码的选项，可选
     * @returns C#类型声明源代码
     */
    static generate(jobject: any, entryName: string, options?: Json2CSOptions): { error?: any, code?: string } {
        if (!Cssd.isValidFieldName(entryName)) {
            return { error: `无效的类名：${entryName}` };
        }
        options || (options = {} as any);
        options.template || (options.template = s_entry_template);
        is_null(options.headLineIndent) && (options.headLineIndent = 0);
        is_null(options.initIndent) && (options.initIndent = 0);
        is_null(options.indent) && (options.indent = 4);
        is_null(options.deep) && (options.deep = -1);
        options.deep < 0 && (options.deep = Number.MAX_SAFE_INTEGER);
        let stack: _ParseStackInfo = {
            targetName: entryName,
            target: jobject,
            meta: _GetMeta(jobject),
            headIndent: options.headLineIndent,
            indent: options.initIndent,
            deep: 0,
        };
        try {
            Cssd.AnyTypeName = options.typeNameOfAny;
            Cssd.ListTypeName = options.typeNameOfList;
            Cssd.MapTypeName = options.typeNameOfMap;
            Cssd.StringMapTypeName = options.typeNameOfStringMap;
            let cssd = Cssd.parseFrom(stack, options);
            let code = cssd.generateStructDefine(stack, options, true);
            code = options.template.replace('@{output}', code);
            Cssd.AnyTypeName = undefined;
            Cssd.ListTypeName = undefined;
            Cssd.MapTypeName = undefined;
            Cssd.StringMapTypeName = undefined;
            return { code: code };
        } catch (e) {
            console.error(e);
            return { error: e };
        }
    }
}

type CSBuiltinEnum = 'string' | 'bool' | 'float' | 'int' | 'long' | 'any';
type CSTypeEnum = CSBuiltinEnum | 'object' | 'array' | 'map<string>' | 'map<int>' | 'custom' | 'named';

/**
 * c-sharp structure desciptor
 */
class Cssd {
    /**
     * any类型的对象类名
     */
    static AnyTypeName: string;
    /**
     * List<>类型名称
     */
    static ListTypeName: string;
    /**
     * Dictionary<>类型名称
     */
    static MapTypeName: string;
    /**
     * StringDictionary<TValue>类型名称
     */
    static StringMapTypeName: string;

    private static _s_pool: Cssd[] = [];
    static create(name?: string, csType?: CSTypeEnum, elm?: Cssd, fields?: Record<string, Cssd>) {
        let ret = Cssd._s_pool.pop() || new Cssd();
        return ret._fromReset(name, csType, elm, fields);
    }
    static createCustom(name: string, customTypeName: string) {
        return Cssd.create()._fromCustom(name, customTypeName);
    }
    static parseFrom(stack: _ParseStackInfo, options: Json2CSOptions) {
        return Cssd.create()._fromParse(stack, options);
    }
    static copyFrom(name: string, other: Cssd) {
        return Cssd.create()._fromCopy(name, other);
    }

    static readonly s_reservedWords = ['int', 'bool', 'byte', 'string', 'ushort', 'short', 'float', 'double', 'long', 'ulong', 'sbyte', 'char',
        'default', 'class', 'readonly', 'public', 'protected', 'private', 'return', 'abstract', 'namespace', 'static', 'explicit', 'extern', 'false', 'true', 'switch', 'break', 'continue',
        'delegate', 'event', 'override', 'void', 'object', 'this', 'base', 'ref', 'out', 'in', 'enum', 'struct', 'as', 'of', 'for', 'new', 'typeof', 'null',
        'finally', 'operator', 'fixed', 'throw', 'case', 'catch', 'params', 'try', 'foreach', 'checked', 'goto', 'if', 'else', 'const', 'implicit', 'unchecked', 'unsafe', 'decimal', 'return', 'interface',
        'using', 'internal', 'sealed', 'virtual', 'do', 'is', 'lock', 'sizeof', 'volatile', 'stackalloc', 'while'
    ];
    static readonly s_validFirstLetters = '_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    static readonly s_validLaterLetters = '_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    static isValidFieldName(name: string) {
        if (!name || name === c_js_cfg_meta_key) {
            return false;
        }
        if (Cssd.s_reservedWords.indexOf(name) !== -1) {
            return false;
        }
        for (let i = 0; i < name.length; ++i) {
            let c = name.substring(i, i + 1);
            if (i === 0) {
                if (Cssd.s_validFirstLetters.indexOf(c) === -1) {
                    return false;
                }
            } else {
                if (Cssd.s_validLaterLetters.indexOf(c) === -1) {
                    return false;
                }
            }
        }
        return true;
    }

    private _name: string;
    private _csType: CSTypeEnum;
    private _element: Cssd;
    private _fields: Record<string, Cssd>;
    private _isElm: boolean;
    private constructor() {
        this._clear();
    }
    private _clear() {
        this._csType = undefined;
        this._element && (this._element = this._element.recycle());
        this._isElm = false;
        if (this._fields) {
            for (let key in this._fields) {
                this._fields[key].recycle();
            }
            this._fields = undefined;
        }
        return this;
    }
    /**
     * 回收
     * @returns 
     */
    recycle(): undefined {
        this._clear();
        Cssd._s_pool.push(this);
        return undefined;
    }
    private _fromReset(name: string, csType?: CSTypeEnum, elm?: Cssd, fields?: Record<string, Cssd>) {
        this._name = name;
        this._csType = csType || 'any';
        this._element = elm;
        this._fields = fields;
        return this;
    }
    private _fromCopy(name: string, other: Cssd) {
        this._clear();
        this._name = name;
        this._csType = other._csType;
        if (other._element) {
            this._element = Cssd.copyFrom(other._name, other._element);
        }
        if (other._fields) {
            this._fields = {};
            for (let key in other._fields) {
                this._fields[key] = Cssd.copyFrom(key, other._fields[key]);
            }
        }
        return this;
    }
    private _fromCustom(name: string, customTypeName: string) {
        this._clear();
        this._name = name;
        this._csType = 'custom';
        this._element = Cssd.create(customTypeName, 'named');
        return this;
    }
    private _fromParse(stack: _ParseStackInfo, options: Json2CSOptions) {
        let targetName = stack.targetName;
        let target = stack.target;
        let meta = stack.meta;
        this._name = targetName;
        if (is_null(target)) {
            throw new Error(`${_getStackPath(stack)} is null`);
        }

        if (options.parseHook) {
            //有拦截
            let ret = options.parseHook(stack);
            if (ret) {
                if (ret.replace) {
                    //直接拦截
                    this._csType = 'custom';
                    this._element = Cssd.create(ret.replace, 'named');
                    return this;
                }
            }
        }

        //直接替换为自定义类型（注意，如果是数组的话，是它的元素直接替换，所以这里不统一处理）
        if (meta && meta.replace && !crUtil.isArray(target)) {
            this._csType = 'custom';
            this._element = Cssd.create(meta.replace, 'named');
            return this;
        }

        //数组
        if (crUtil.isArray(target)) {
            if (meta && meta.replaceAry) {
                //数组直接替换为自定义类型
                this._csType = 'custom';
                this._element = Cssd.create(meta.replaceAry, 'named');
            } else {
                //普通处理，或者元素被替换
                if (meta && meta.replace && (target.length === 0 || !crUtil.isArray(target[0]))) {
                    //如果元素直接替换，且target不是多维数组，加快判断速度
                    this._csType = 'array';
                    this._element = Cssd.createCustom(targetName, meta.replace);
                    this._element._isElm = true;
                } else {
                    //普通情况
                    let elm = Cssd.create(targetName, 'any');
                    for (let e of target) {
                        stack.target = e;
                        elm = Cssd._combine(elm, Cssd.parseFrom(stack, options), stack);
                        stack.target = target;
                    }
                    this._csType = 'array';
                    this._element = elm;
                    this._element._isElm = true;
                }
            }
            return this;
        }

        //是普通对象
        if (crUtil.isObject(target)) {
            if (meta && meta.map) {
                //当前对象看做一个字典
                let keyType: CSTypeEnum = 'string';
                let sample = '';
                if (typeof meta.map === 'string') {
                    sample = meta.map;
                } else if (typeof meta.map === 'object') {
                    keyType = meta.map.keyType || 'string';
                    sample = meta.map.sample;
                }
                let elm: Cssd;
                if (sample) {
                    //以sample做参考
                    let preMeta = stack.meta;
                    stack.meta = _GetMeta(target, '', preMeta);
                    stack.target = target[sample];
                    elm = Cssd.parseFrom(stack, options);
                    stack.target = target;
                    stack.meta = preMeta;
                } else {
                    //联合处理
                    elm = Cssd.create(targetName, 'any');
                    for (let key in target) {
                        if (key === c_js_cfg_meta_key) {
                            continue;
                        }
                        let preMeta = stack.meta;
                        stack.meta = _GetMeta(target, key, preMeta);
                        stack.target = target[key];
                        elm = Cssd._combine(elm, Cssd.parseFrom(stack, options), stack);
                        stack.target = target;
                        stack.meta = preMeta;
                    }
                }
                this._csType = keyType === 'string' ? 'map<string>' : 'map<int>';
                this._element = elm;
                this._element._isElm = true;
            } else {
                //normal obj
                let fds: Record<string, Cssd> = {};
                for (let key in target) {
                    if (key === c_js_cfg_meta_key) {
                        continue;
                    }
                    if (!Cssd.isValidFieldName(key)) {
                        console.log(`字段名无效，直接忽略: ${key}`);
                        continue;
                    }
                    let st = _pushStack(stack, target[key], key, options);
                    st.meta = _GetMeta(target, key, st.meta);
                    let fd = Cssd.parseFrom(st, options);
                    _popStack(st, options);
                    fds[key] = fd;
                }
                this._csType = 'object';
                this._fields = fds;
            }
            return this;
        }

        if (typeof target === 'number') {
            if (Math.floor(target) === target) {
                this._csType = 'int';
            } else {
                this._csType = 'float';
            }
        } else if (typeof target === 'string') {
            this._csType = 'string';
        } else if (typeof target === 'boolean') {
            this._csType = 'bool';
        } else if (typeof target === 'bigint') {
            this._csType = 'long';
        } else {
            //未知类型
            throw new Error(`${_getStackPath(stack)} 未知类型`);
        }
        return this;
    }

    /**
     * c#类型
     */
    get csType() {
        return this._csType;
    }
    get csTypeStr() {
        let t = this._csType;
        if (t === 'any') {
            return Cssd.AnyTypeName || 'object';
        }
        if (Cssd._isBuiltin(t)) {
            return t;
        }
        if (t === 'named') {
            return this._name;
        }
        if (t === 'custom') {
            return this._element.csTypeStr;
        }
        if (t === 'array') {
            if (Cssd.ListTypeName) {
                return `${Cssd.ListTypeName}<${this._element.csTypeStr}>`;
            } else {
                return `${this._element.csTypeStr}[]`;
            }
        }
        if (t === 'map<int>') {
            let mapTyepName = Cssd.MapTypeName || 'System.Collections.Generic.Dictionary';
            return `${mapTyepName}<int, ${this._element.csTypeStr}>`;
        }
        if (t === 'map<string>') {
            if (Cssd.StringMapTypeName) {
                return `${Cssd.StringMapTypeName}<${this._element.csTypeStr}>`;
            }
            let mapTyepName = Cssd.MapTypeName || 'System.Collections.Generic.Dictionary';
            return `${mapTyepName}<string, ${this._element.csTypeStr}>`;
        }
        return Cssd._toStructName(this._name, undefined, this._isElm);
    }
    /**
     * 字段声明
     */
    get fields() {
        return this._fields;
    }
    /**
     * 生成结构定义
     * @param stack 
     * @param options 
     * @param isRoot 是否是根定义，默认false
     * @param isElm 是否是某个容器里的元素类型，默认false
     * @returns 
     */
    generateStructDefine(stack: _ParseStackInfo, options: Json2CSOptions, isRoot?: boolean): string {
        let t = this._csType;
        if (t === 'array' || t === 'map<string>' || t === 'map<int>') {
            return this._element.generateStructDefine(stack, options, undefined);
        }
        if (t === 'object') {
            let parseJsonStr = "";
            let code = `${_indent2Str(stack.headIndent)}public class ${Cssd._toStructName(this._name, isRoot, this._isElm)} :IParseJsonObject\n${_indent2Str(stack.indent)}{`;
            for (let key in this._fields) {
                let fd = this._fields[key];
                stack = _pushStack(stack, undefined, key, options);
                code += '\n' + fd.generateField(stack, options);
                let getJsonDesc: string;
                if (Cssd._isBuiltin(fd.csType)) {
                    if (fd.csType !== "any") {
                        getJsonDesc = `Get${fd.csType.charAt(0).toUpperCase() + fd.csType.slice(1)}("${fd._name}");`;
                    }
                }
                else {
                    getJsonDesc = `GetJObject("${fd._name}").Parse<${fd.csTypeStr}>();`;
                }
                if (getJsonDesc) {
                    stack = _pushStack(stack, undefined, undefined, options);
                    parseJsonStr += `${_indent2Str(stack.indent)}${key} = jo.${getJsonDesc}\n`;
                    stack = _popStack(stack, options);
                }
                stack = _popStack(stack, options);
            }
            stack = _pushStack(stack, undefined, undefined, options);
            code += `\n\n${_indent2Str(stack.indent)}public object OnParse(IJsonObject jo)\n${_indent2Str(stack.indent)}{\n${parseJsonStr}${_indent2Str(stack.indent + options.indent)}return this;\n${_indent2Str(stack.indent)}}`;
            stack = _popStack(stack, options);
            code += `\n${_indent2Str(stack.indent)}}`;
            return code;
        }
        return ''
    }
    /**
     * 生成一个字段（包括它可能的结构定义）
     * @param stack 
     * @param options 
     */
    generateField(stack: _ParseStackInfo, options: Json2CSOptions): string {
        if (this._csType === 'named') {
            throw new Error(`${_getStackPath(stack)} 具名类型不应该生成对应的代码`);
        }
        let stDefine = this.generateStructDefine(stack, options);
        let fdDefine = `${_indent2Str(stack.headIndent)}public ${this.csTypeStr} ${this._name} { private set; get; }`
        if (stDefine) {
            return stDefine + '\n' + fdDefine;
        }
        return fdDefine;
    }


    private static _combine(d1: Cssd, d2: Cssd, stack: _ParseStackInfo): Cssd {
        let d = Cssd._innerCombine(d1, d2, false, stack);
        if (d !== d1) {
            d1.recycle();
        }
        if (d !== d2) {
            d2.recycle();
        }
        return d;
    }
    private static _innerCombine(current: Cssd, other: Cssd, alwaysRetCur: boolean, stack: _ParseStackInfo): Cssd {
        if (other.csType === 'any') {
            return current;
        }
        if (current.csType === 'any') {
            if (alwaysRetCur) {
                return current._fromCopy(current._name, other);
            }
            return other;
        }
        if (Cssd._isNumber(current) && Cssd._isNumber(other)) {
            if (current._csType === other._csType || current._csType === 'float') {
                return current;
            }
            if (alwaysRetCur) {
                return current._clear()._fromReset(current._name, 'float');
            }
            return other;
        }
        if (current.csType !== other.csType) {
            throw new Error(`${_getStackPath(stack)} 类型不匹配`);
        }
        if (current.csType === 'named') {
            if (current._name !== other._name) {
                throw new Error(`${_getStackPath(stack)} 自定义类型名不匹配`);
            }
            return current;
        }
        if (current.csType === 'custom' || current.csType === 'array' || current.csType === 'map<int>' || current.csType === 'map<string>') {
            Cssd._innerCombine(current._element, other._element, true, stack);
            return current;
        }
        if (current.csType === 'object') {
            let lhs = current._fields;
            let rhs = other._fields;
            for (let key in lhs) {
                let dd1 = lhs[key];
                let dd2 = rhs[key];
                if (!dd2) {
                    throw new Error(`${_getStackPath(stack)} object字段不完全匹配`);
                }
                Cssd._innerCombine(dd1, dd2, true, stack);
            }
            for (let key in rhs) {
                if (!lhs[key]) {
                    throw new Error(`${_getStackPath(stack)} object字段不完全匹配`);
                }
            }
            return current;
        }
        return current;
    }

    private static _isNumber(d: Cssd) {
        return d.csType === 'float' || d.csType === 'int';
    }
    private static _isBuiltin(csType: CSTypeEnum): csType is CSBuiltinEnum {
        return csType === 'bool' || csType === 'string' || csType === 'int' || csType === 'float' || csType === 'long' || csType === 'any';
    }
    private static _toStructName(name: string, isRoot?: boolean, isElm?: boolean) {
        if (isRoot) {
            return name;
        }
        let ret = '__' + name.substring(0, 1).toUpperCase() + name.substring(1);
        if (isElm) {
            return ret + 'Elm';
        }
        return ret;
    }
}

function _pushStack(stack: _ParseStackInfo, target: any, targetName: string, options: Json2CSOptions, deepStepIn: boolean = true): _ParseStackInfo {
    stack._stackPool || (stack._stackPool = []);
    let newStack = stack._stackPool.pop() || ({} as _ParseStackInfo);
    newStack.target = target;
    newStack.targetName = targetName;
    newStack.meta = stack.meta;
    if (deepStepIn) {
        newStack.deep = stack.deep - 1;
        newStack.indent = stack.indent + options.indent;
    } else {
        newStack.deep = stack.deep;
        newStack.indent = stack.indent;
    }
    newStack.headIndent = newStack.indent;
    if (crUtil.isObject(target)) {
        let meta: CSCfgMetaSt = target[c_js_cfg_meta_key];
        if (meta) {
            if (not_null(meta.deep)) {
                newStack.deep = meta.deep;
            }
        }
    }
    newStack.parent = stack;
    return newStack;
}
function _popStack(stack: _ParseStackInfo, options: Json2CSOptions): _ParseStackInfo {
    if (!stack) {
        return undefined;
    }
    let parent = stack.parent;
    stack.target = undefined;
    stack._stackPool || (stack._stackPool = []);
    stack._stackPool.push(stack);
    return parent;
}
function _getStackPath(stack: _ParseStackInfo): string {
    let path = '';
    while (stack) {
        path = stack.targetName + (path ? '.' + path : '');
        stack = stack.parent;
    }
    return path;
}
function _indent2Str(indent: number) {
    let str = '';
    if (indent && indent > 0) {
        for (let i = 0; i < indent; ++i) {
            str += ' ';
        }
    }
    return str;
}