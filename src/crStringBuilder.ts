/**
 * 字符串高效拼接器，类似C#的StringBuilder
 */
export class crStringBuilder {
    private _d_strs: Array<string>;
    constructor() {
        this._d_strs = new Array<string>();
    }
    /**
     * 添加一个字符串
     * @param e 
     */
    append(e: string) {
        this._d_strs.push(e);
    }
    /**
     * 清理所有字符串
     */
    clear() {
        this._d_strs.length = 0;
    }
    /**
     * 返回最终拼接完毕的字符串
     */
    toString() {
        return this._d_strs.join('');
    }
    /**
     * 返回最终拼接完毕的字符串，并清理builder
     * @returns 
     */
    toStringThenClear() {
        let s = this.toString();
        this.clear();
        return s;
    }
}