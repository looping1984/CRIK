
/**
 * 抽象类类型定义模板
 */
export type AbstractOf<T> = Function & {
    prototype: T;
};

/**
 * 构造函数参数不定的类类型定义模板
 */
export interface ClassOf<T> {
    new(...args): T;
};

/**
 * 构造函数参数数量为0的类类型定义模板
 */
export interface ClassOf0<T> {
    new(): T;
}

/**
 * 构造函数参数数量为1的类类型定义模板
 */
export interface ClassOf1<T, ConstructorArg0> {
    new(arg0: ConstructorArg0): T;
}

/**
 * 构造函数参数数量为2的类类型定义模板
 */
export interface ClassOf2<T, ConstructorArg0, ConstructorArg1> {
    new(arg0: ConstructorArg0, arg1: ConstructorArg1): T;
}

/**
 * 构造函数参数数量为3的类类型定义模板
 */
export interface ClassOf3<T, ConstructorArg0, ConstructorArg1, ConstructorArg2> {
    new(arg0: ConstructorArg0, arg1: ConstructorArg1, arg2: ConstructorArg2): T;
}

/**
 * 构造函数参数数量为4的类类型定义模板
 */
export interface ClassOf4<T, ConstructorArg0, ConstructorArg1, ConstructorArg2, ConstructorArg3> {
    new(arg0: ConstructorArg0, arg1: ConstructorArg1, arg2: ConstructorArg2, arg3: ConstructorArg3): T;
}

/**
 * 一个辅助类型，表明是Json格式的对象
 */
export class JsonObjectType { }

/**
 * 定义一个新类型，该类型的属性集合是T的属性集合的可写版本
 * Make all properties in T writable
 */
export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
}

/**
 * 基础类型联合
 */
export type Primitives = undefined | null | boolean | string | number | Function;

/**
 * 递归让给定类型只读
 */
export type DeepReadonly<T> =
    T extends never ? T :
    T extends Primitives ? T :
    T extends Array<infer U> ? _ImmutableArray<U> :
    T extends Map<infer K, infer V> ? _ImmutableMap<K, V> :
    T extends Set<infer M> ? _ImmutableSet<M> : _ImmutableObject<T>;

type _ImmutableArray<T> = ReadonlyArray<DeepReadonly<T>>;
type _ImmutableMap<K, V> = ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>;
type _ImmutableSet<T> = ReadonlySet<DeepReadonly<T>>;
type _ImmutableObject<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };

/**
 * check if the given v is null or undefined
 * @param v value to be checked
 * @returns true if v is null or undefined
 */
export function is_null(v: any): boolean { return v === undefined || v === null; }

/**
 * check if the given v is not null nor undefined
 * @param v value to be checked
 */
export function not_null(v: any): boolean { return v !== undefined && v !== null; }

/**
 * 智能回调给定函数
 * @param func 给定函数，如果传空，什么都不做
 * @param thisObj this 可选
 * @param args 函数参数列表，可选
 * @return func的返回值，调用失败返回undefined
 */
export function smartCall(func: Function, thisObj?: any, ...args): any {
    if (!func) {
        return undefined;
    }
    return func.apply(is_null(thisObj) ? this : thisObj, args);
}

export function smartCall0(func: () => any, thisObj?: any): any {
    if (func) {
        if (thisObj) {
            return func.apply(thisObj);
        } else {
            return func();
        }
    }
    return undefined;
}

export function smartCall1(func: (a0: any) => any, thisObj: any, arg0: any): any {
    if (func) {
        if (thisObj) {
            return func.call(thisObj, arg0);
        } else {
            return func(arg0);
        }
    }
    return undefined;
}

export function smartCall2(func: (a0: any, a1: any) => any, thisObj: any, arg0: any, arg1: any): any {
    if (func) {
        if (thisObj) {
            return func.call(thisObj, arg0, arg1);
        } else {
            return func(arg0, arg1);
        }
    }
    return undefined;
}

export function smartCall3(func: (a0: any, a1: any, a2: any) => any, thisObj: any, arg0: any, arg1: any, arg2: any): any {
    if (func) {
        if (thisObj) {
            return func.call(thisObj, arg0, arg1, arg2);
        } else {
            return func(arg0, arg1, arg2);
        }
    }
    return undefined;
}

export function smartCall4(func: (a0: any, a1: any, a2: any, a3: any) => any, thisObj: any, arg0: any, arg1: any, arg2: any, arg3: any): any {
    if (func) {
        if (thisObj) {
            return func.call(thisObj, arg0, arg1, arg2, arg3);
        } else {
            return func(arg0, arg1, arg2, arg3);
        }
    }
    return undefined;
}

/**
 * 智能回调给定函数，@see SmartCall 的'apply'版本
 * @param func 给定函数，如果传空，什么都不做
 * @param thisObj this 可选
 * @param args 函数参数列表，可选
 * @return func的返回值，调用失败返回undefined
 */
export function smartApply(func: Function, thisObj?: any, args?: any[]): any {
    if (!func) {
        return undefined;
    }
    return func.apply(thisObj, args);
}

/**
 * 基础工具集合
 */
export class crUtil {
    static defaultEquals<T>(a: T, b: T): boolean {
        return a === b;
    }
    static defaultCompare<T>(a: T, b: T): number {
        return a < b ? -1 : a > b ? 1 : 0;
    }
    /**
     * 将给定的对象的所有属性变为只读类型
     * @param val 
     * @returns 返回val本身
     */
    static toReadonly<T>(val: T): Readonly<T> {
        return val as Readonly<T>;
    }

    /**
     * 数组相关工具
     */
    static readonly array = {
        /**
         * 移除给定项
         * @param arry 
         * @param element 
         * @returns 
         */
        remove: function <T>(arry: Array<T>, element: T) {
            let idx = arry.indexOf(element);
            if (idx !== -1) {
                arry.splice(idx, 1);
                return true;
            }
            return false;
        }
    };

    /**
     * 深度拷贝给定数据
     * @param data 
     * @returns data的一个深度拷贝
     */
    static deepClone<T extends any = any>(data: T): T {
        if (is_null(data)) {
            //空对象
            return data;
        }
        if (typeof data !== 'object') {
            //普通类型对象
            return data;
        }
        if (Object.prototype.toString.call(data) === '[object Array]') {
            //数组
            let ret = [];
            for (let e of (data as any)) {
                ret.push(crUtil.deepClone(e));
            }
            return ret as T;
        } else {
            //普通对象
            let ret = {};
            for (let key in data) {
                (ret as any)[key] = crUtil.deepClone(data[key]) as any;
            }
            return ret as T;
        }
    }

    /**
     * 深度比较
     * @param val1 
     * @param val2 
     * @return 完全相等返回true （注意null与undefined认为全等）
     */
    static deepCompare(val1: any, val2: any): boolean {
        if (val1 === val2) {
            //直接全等
            return true;
        }
        let t1 = typeof val1;
        let t2 = typeof val2;
        if (t1 === 'function') {
            //函数特殊处理
            if (is_null(val2) || t2 === 'function') {
                return true;
            }
            return false;
        }
        if (t2 === 'function') {
            //函数特殊处理
            if (is_null(val1)) {
                return true;
            }
            return false;
        }
        if (t1 !== t2 || t1 !== 'object') {
            //类型不一致
            //或者不是复杂对象
            return false;
        }
        if (Object.prototype.toString.call(val1) === '[object Array]') {
            //数组
            if (Object.prototype.toString.call(val2) !== '[object Array]') {
                //类型不一致
                return false;
            }
            if (val1.length !== val2.length) {
                //数组长度不一致
                return false;
            }
            for (let i = 0; i < val1.length; ++i) {
                if (!crUtil.deepCompare(val1[i], val2[i])) {
                    //有一个元素不同
                    return false;
                }
            }
            //两个数组全等
            return true;
        }
        if (Object.prototype.toString.call(val2) === '[object Array]') {
            //类型不一致
            return false;
        }
        for (let k in val1) {
            //看val1里每个元素是否与val2对应key的值完全一致
            if (!crUtil.deepCompare(val1[k], val2[k])) {
                //有一个不同
                return false;
            }
        }
        for (let k in val2) {
            //再看val2里是否有多出的key，只要有，就肯定不全等
            let v = val2[k];
            if (is_null(v) || typeof v === 'function') {
                continue;
            }
            if (not_null(val1[k])) {
                continue;
            }
            return false;
        }
        //全等
        return true;
    }

    /**
     * 判断给定数值是否是对象（不是number等内建类型）
     * @param val 
     * @param inclueArray 包括数组，默认不包括
     * @returns 
     */
    static isObject(val: any, inclueArray?: boolean): boolean {
        if (val && typeof val === "object") {
            return inclueArray || Object.prototype.toString.call(val) === "[object Object]";
        }
        return false;
    }

    /**
     * 判断给定对象是否是数组
     * @param val 
     * @returns 
     */
    static isArray(val: any): val is any[] {
        if (val && typeof val === "object") {
            return Object.prototype.toString.call(val) === "[object Array]";
        }
        return false;
    }

    /**
     * 任何值转换为number值
     * @param v 任何值，包括undefined和null
     * @param defVal v无效（null或者undefined）的时候的默认值，不填表示NaN
     * @return number
     */
    static toNumber(v: any, defVal?: number): number {
        if (is_null(v)) {
            return is_null(defVal) ? NaN : defVal;
        }
        return Number(v);
    }

    /**
     * 任何对象转化为字符串
     * @param obj 
     * @returns 
     */
    static toString(obj: any) {
        if (obj === undefined) {
            return "undefined";
        }
        if (obj === null) {
            return "null";
        }
        return obj.toString();
    }

    /**
     * 安全解析json字符串为对象
     * @param jsonStr 
     * @param defVal 
     * @returns 
     */
    static parseJson(jsonStr: string, defVal?: any) {
        try {
            return JSON.parse(jsonStr);
        } catch (e) {
            return defVal;
        }
    }

    /**
     * 获得给定实例的类类型
     * @param obj 对象实例 
     * @returns 类类型
     */
    static typeOf<T>(obj: T): AbstractOf<T> {
        let prototype = Object.getPrototypeOf(obj);
        return prototype ? prototype.constructor : undefined;
    }
    /**
     * 获取给定类的第一基类
     * @param ClassType 给定类类型
     * @param ignoreObjectClass 是否忽略最根部的Object类，默认不忽略
     * @returns 基类类型
     */
    static baseTypeOf<T>(ClassType: AbstractOf<T>, ignoreObjectClass?: boolean): any {
        if (!ClassType || (ClassType as any) === Object) {
            return undefined;
        }
        let c = Object.getPrototypeOf(ClassType.prototype);
        let type = c ? c.constructor : undefined;
        if (!type) {
            return undefined;
        }
        if (ignoreObjectClass && type === Object) {
            return undefined;
        }
        return type;
    }
    /**
     * 判断给定类是否是指定类的子类
     * @param MyClass 待判断的类
     * @param SuperClass 可能的父类
     * @param noEqual 是否排除MyClass与SuperClass相等的情况，默认不排除
     */
    static subClassOf<T1, T2>(MyClass: AbstractOf<T1>, SuperClass: AbstractOf<T2>, noEqual?: boolean): MyClass is AbstractOf<T2> {
        if (noEqual && MyClass === SuperClass) {
            return false;
        }
        let cur = MyClass;
        while (cur !== SuperClass) {
            cur = crUtil.baseTypeOf(cur, true);
            if (!cur) {
                return false;
            }
        }
        return true;
    }
    /**
     * 判断给定的对象是否是指定类型的实例
     * @param t 给定对象
     * @param ClassType 指定类型
     * @param ignoreInherit 是否忽略继承，true表示只考虑ClassType的实例，不考虑它子类的实例；默认false，表示全部考虑
     * @returns 是否是实例
     */
    static instanceOf<T>(t: any, ClassType: AbstractOf<T>, ignoreInherit?: boolean): boolean {
        if (!ignoreInherit) {
            return t instanceof ClassType;
        }
        return crUtil.typeOf(t) === ClassType;
    }
    /**
     * 夹取
     * @param edge1 
     * @param edge2 
     * @param t 
     * @returns 
     */
    static clamp(edge1: number, edge2: number, t: number): number {
        if (edge1 > edge2) {
            return t < edge2 ? edge2 : t > edge1 ? edge1 : t;
        }
        else {
            return t < edge1 ? edge1 : t > edge2 ? edge2 : t;
        }
    }
}