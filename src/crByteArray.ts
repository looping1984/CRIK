import { crUTF8 } from "./crUTF8";
import { crUtil, is_null } from "./crUtil";

/**
 * 动态可伸缩的字节数组
 * 类似AS3里的ByteArray
 */
export class crByteArray {
    private _d_outerBound: boolean;
    private _d_buff: ArrayBufferLike;
    private _d_byteView: Uint8Array;
    private _d_dataView: DataView;
    private _d_tempArray: Array<number>;
    private _d_pos: number;
    private _d_len: number;
    constructor(capacityOrBuff?: number | ArrayBufferLike) {
        capacityOrBuff || (capacityOrBuff = 0);
        if (typeof capacityOrBuff === 'number') {
            //自己初始化
            this._d_outerBound = false;
            this._alloc(capacityOrBuff || 0);
        } else {
            //外部的buff
            this._d_outerBound = true;
            this._d_buff = capacityOrBuff;
            this._refreshView();
        }
        this._d_pos = 0;
        this._d_len = 0;
    }
    /**
     * 直接绑定一个外部的数据源
     * @param buff 
     */
    bind(buff: ArrayBufferLike) {
        this.release();
        this._d_buff = buff;
        this._refreshView();
        this._d_pos = 0;
        this._d_len = buff ? buff.byteLength : 0;
        this._d_outerBound = true;
    }
    /**
     * 该bytearray是否绑定了外部的buff
     */
    get outerBound(): boolean {
        return this._d_outerBound;
    }
    /**
     * 当前总的分配空间
     */
    get capacity() {
        return this._d_buff ? this._d_buff.byteLength : 0;
    }
    /**
     * 当前读写磁头的位置
     */
    get position() {
        return this._d_pos;
    }
    set position(val: number) {
        if (val < 0) {
            return;
        }
        this._d_pos = crUtil.clamp(0, this._d_len, val);
    }
    /**
     * 当前数据长度
     */
    get length() {
        return this._d_len;
    }
    set length(val: number) {
        if (val < 0) {
            return;
        }
        this._alloc(val);
        this._d_len = val;
        if (this._d_pos > val) {
            this._d_pos = val;
        }
    }
    /**
     * 剩下可读的字节数
     */
    get bytesAvailable(): number {
        return this._d_len - this._d_pos;
    }
    /**
     * 返回内部使用的buff
     */
    get buffer() {
        return this._d_buff;
    }
    /**
     * 清空
     */
    clear() {
        this._d_pos = 0;
        this._d_len = 0;
    }
    /**
     * 把所占内存释放，但是还可以继续使用
     */
    release() {
        this.clear();
        this._d_dataView = undefined;
        this._d_byteView = undefined;
        this._d_buff = undefined;
        this._d_outerBound = false;
    }
    /**
     * 创建一个view返回（未读取的数据）
     */
    view(): ArrayBufferView {
        return new DataView(this._d_buff, this._d_pos, this.length);
    }

    readUint8(): number {
        return this._d_dataView.getUint8(this._checkRead(1));
    }
    readInt8(): number {
        return this._d_dataView.getInt8(this._checkRead(1));
    }
    readUint16(): number {
        return this._d_dataView.getUint16(this._checkRead(2), true);
    }
    readInt16(): number {
        return this._d_dataView.getInt16(this._checkRead(2), true);
    }
    readUint32(): number {
        return this._d_dataView.getUint32(this._checkRead(4), true);
    }
    readInt32(): number {
        return this._d_dataView.getInt32(this._checkRead(4), true);
    }
    readFloat(): number {
        return this._d_dataView.getFloat32(this._checkRead(4), true);
    }
    readDouble(): number {
        return this._d_dataView.getFloat64(this._checkRead(8), true);
    }
    readEmpty(byteNum: number) {
        this._checkRead(byteNum);
    }
    readString(byteNum?: number): string {
        is_null(byteNum) && (byteNum = this.bytesAvailable);
        let pos = this._checkRead(byteNum);
        return crUTF8.utf8ArrayToString(this._d_byteView, pos, byteNum);
    }
    readStringWithLen(bytesOfStrLen: number): string {
        let byteNum: number;
        if (bytesOfStrLen === 1) {
            byteNum = this.readUint8();
        } else if (bytesOfStrLen === 2) {
            byteNum = this.readUint16();
        } else if (bytesOfStrLen === 4) {
            byteNum = this.readUint32();
        } else {
            throw new Error(`ssByteArray.readStringWithLen param invalid: ${bytesOfStrLen}`);
        }
        return this.readString(byteNum);
    }
    readString1() {
        return this.readStringWithLen(1);
    }
    readString2() {
        return this.readStringWithLen(2);
    }
    readString4() {
        return this.readStringWithLen(4);
    }
    writeUint8(val: number) {
        let pos = this._checkWrite(1);
        this._d_dataView.setUint8(pos, val);
    }
    writeInt8(val: number) {
        let pos = this._checkWrite(1);
        this._d_dataView.setInt8(pos, val);
    }
    writeUint16(val: number) {
        let pos = this._checkWrite(2);
        this._d_dataView.setUint16(pos, val, true);
    }
    writeInt16(val: number) {
        let pos = this._checkWrite(2);
        this._d_dataView.setInt16(pos, val, true);
    }
    writeUint32(val: number) {
        let pos = this._checkWrite(4);
        this._d_dataView.setUint32(pos, val, true);
    }
    writeInt32(val: number) {
        let pos = this._checkWrite(4);
        this._d_dataView.setInt32(pos, val, true);
    }
    writeFloat(val: number) {
        let pos = this._checkWrite(4);
        this._d_dataView.setFloat32(pos, val, true);
    }
    writeDouble(val: number) {
        let pos = this._checkWrite(8);
        this._d_dataView.setFloat64(pos, val, true);
    }
    writeEmpty(byteNum: number) {
        this._checkWrite(byteNum);
    }
    writeBuffer(aryOrBuff: ArrayLike<number> | ArrayBufferLike) {
        if (!aryOrBuff) {
            return;
        }
        let ary: ArrayLike<number>;
        if (aryOrBuff['length'] === undefined) {
            ary = new Uint8Array(aryOrBuff as ArrayBufferLike);
        } else {
            ary = aryOrBuff as ArrayLike<number>;
        }
        let pos = this._checkWrite(ary.length);
        this._d_byteView.set(ary, pos);
    }
    writeRepeats(byteVal: number, count: number) {
        let pos = this._checkWrite(count);
        this._d_byteView.fill(byteVal, pos, pos + count);
    }
    writeString1(s: string) {
        this.writeStringWithLen(s, 1);
    }
    writeString2(s: string) {
        this.writeStringWithLen(s, 2);
    }
    writeString4(s: string) {
        this.writeStringWithLen(s, 4);
    }
    writeStringWithLen(s: string, bytesOfLen: number): number {
        if (bytesOfLen !== 1 && bytesOfLen !== 2 && bytesOfLen !== 4) {
            throw new Error(`ssByteArray.writeStringWithLen param invalid: ${bytesOfLen}`);
        }
        this.writeEmpty(bytesOfLen);
        let strLen = this.writeString(s);
        this.position -= strLen + bytesOfLen;
        if (bytesOfLen === 1) {
            this.writeUint8(strLen);
        } else if (bytesOfLen === 2) {
            this.writeUint16(strLen);
        } else {
            this.writeUint32(strLen);
        }
        this.position += strLen;
        return strLen;
    }
    writeString(s: string): number {
        this._d_tempArray = crUTF8.fastString2Array(s, this._d_tempArray);
        this.writeBuffer(this._d_tempArray);
        let count = this._d_tempArray.length;
        this._d_tempArray.length = 0;
        return count;
    }

    private _checkWrite(byteNum: number): number {
        let old = this._d_pos;
        this._d_pos += byteNum;
        if (this._d_len < this._d_pos) {
            this._d_len = this._d_pos;
        }
        this._alloc(this._d_len);
        return old;
    }
    private _checkRead(byteNum: number): number {
        if (this._d_pos + byteNum > this._d_len) {
            throw new Error('ssByteArray.overflow by' + byteNum);
        }
        let old = this._d_pos;
        this._d_pos += byteNum;
        return old;
    }
    private _alloc(count: number) {
        if (this.capacity >= count) {
            return;
        }
        count = this._bestCapacity(count);
        this._d_buff = new ArrayBuffer(count);
        this._refreshView();
    }
    private _refreshView() {
        this._d_dataView = new DataView(this._d_buff);
        let old = this._d_byteView;
        this._d_byteView = new Uint8Array(this._d_buff);
        if (old) {
            this._d_byteView.set(old);
        }
    }
    private _bestCapacity(count: number): number {
        return crUtil.clamp(count + 64, count + 1024 * 1024, Math.floor(count * 1.5));
    }
}