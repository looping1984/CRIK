
import * as crypto from "crypto";
import * as uglifyJS from "uglify-js";
import * as zlib from "zlib";
import { crByteArray } from "./crByteArray";
import { crFS } from "./crFS";
import { AbstractOf, crUtil, is_null, JsonObjectType } from "./crUtil";

/**
 * 一些常用的工具接口
 */
export class crMoreUtil {
    /**
     * 描述字节数
     * @param byteNum 字节数
     * @param unit 单位，可选，默认k
     */
    static descBytes(byteNum: number, unit?: 'B' | 'K' | 'M' | 'b' | 'k' | 'm') {
        unit || (unit = 'k');
        if (unit === 'b' || unit === 'B') {
            return byteNum.toString() + unit;
        } else if (unit === 'M' || unit === 'm') {
            return (byteNum / 1024 / 1024).toFixed(2) + unit;
        } else {
            if (unit !== 'K' && unit !== 'k') {
                unit = 'k';
            }
            return (byteNum / 1024).toFixed(1) + unit;
        }
    }

    /**
     * 混淆（加压缩）js源代码
     * @param jsSourceCode 待混淆的js源代码
     * @returns 失败返回false，成功返回混淆的字符串结果
     */
    static mixJSCode(jsSourceCode: string) {
        if (!jsSourceCode) {
            return undefined;
        }
        let mixOut = uglifyJS.minify(jsSourceCode);
        if (mixOut.error) {
            console.error(mixOut.error);
            return false;
        }
        return mixOut.code;
    }
    /**
     * 混淆（加压缩）js源代码
     * @param jsPath js源代码文件路径
     * @param outPath 混淆结果的输出文件路径，可选
     * @returns 失败返回false，成功返回混淆的字符串结果
     */
    static mixJS(jsPath: string, outPath: string) {
        let source = crFS.read_text(jsPath);
        if (!source) {
            return false;
        }
        let mixCode = crMoreUtil.mixJSCode(source);
        if (!mixCode) {
            return false;
        }
        if (outPath) {
            if (!crFS.write_text(mixCode, outPath)) {
                return false;
            }
        }
        return mixCode;
    }

    /**
     * 计算给定数据的md5码
     * @param data string | Uint8Array | DataView | Buffer
     * @param upperCase 是否大写，默认小写
     * @param fixLen 返回固定的长度，可选，默认返回所有md5字符串
     * @return md5码
     */
    static md5(data: string | NodeJS.ArrayBufferView, upperCase?: boolean, fixLen?: number) {
        if (is_null(data)) {
            data = '';
        }
        let md5 = crypto.createHash('md5');
        let str = md5.update(data).digest('hex');
        if (upperCase) {
            str = str.toUpperCase();
        } else {
            str = str.toLowerCase();
        }
        if (fixLen && str.length !== fixLen) {
            for (let i = str.length; i < fixLen; ++i) {
                str = str + '0';
            }
            str = str.substr(0, fixLen);
        }
        return str;
    }
    /**
     * 计算给定文件的md5
     * @param filePath 文件路径
     * @param upperCase 是否大写，默认小写
     * @param fixLen 返回的md5码长度，可选，默认md5自然长度
     * @return md5 or undefined
     */
    static fileMD5(filePath: string, upperCase?: boolean, fixLen?: number) {
        let fdata = crFS.read_binary(filePath);
        if (!fdata) {
            return undefined;
        }
        return crMoreUtil.md5(fdata, upperCase, fixLen);
    }
    /**
     * 计算给定文本文件的md5
     * @param filePath 文件路径
     * @param upperCase 是否大写，默认小写
     * @param fixLen 返回的md5码长度，可选，默认md5自然长度
     * @return md5 or undefined
     */
    static textFileMD5(filePath: string, upperCase?: boolean, fixLen?: number) {
        let fdata = crFS.read_text(filePath);
        if (!fdata) {
            return undefined;
        }
        return crMoreUtil.md5(fdata, upperCase, fixLen);
    }

    /**
     * 将一个数据base64
     * @param data 
     * @returns 
     */
    static base64(data: any) {
        let str = JSON.stringify(data);
        let buf = Buffer.from(str);
        return buf.toString('base64');
    }
    /**
     * 解析base64字符串为文本
     * @param base64 base64字符串
     * @param isZlib base64字符串的源内容是否是zlib压缩格式，默认false
     * @returns 最终字符串
     */
    static parseBase64AsString(base64: string, isZlib?: boolean) {
        if (!base64) {
            return '';
        }
        let buf = Buffer.from(base64, 'base64');
        if (isZlib) {
            buf = zlib.inflateSync(buf);
        }
        return buf.toString();
    }

    /**
     * 解析base64字符串为数组
     * @param base64 base64字符串
     * @param isZlib base64字符串的源内容是否是zlib压缩格式，默认false
     * @returns 最终字符串
     */
    static parseBase64AsBuff(base64: string, isZlib?: boolean) {
        if (!base64) {
            return undefined;
        }
        let buf = Buffer.from(base64, 'base64');
        if (isZlib) {
            buf = zlib.inflateSync(buf);
        }
        return buf;
    }
    /**
     * 解析base64字符串为json对象
     * @param base64 
     * @param isZlib base64字符串的源内容是否是zlib压缩格式，默认false
     * @returns 最终json对象
     */
    static parseBase64Json(base64: string, isZlib?: boolean) {
        if (!base64) {
            return undefined;
        }
        return JSON.parse(crMoreUtil.parseBase64AsString(base64, isZlib));
    }

    /**
     * 压缩给定数据
     * @param source 源数据
     * @returns 压缩完毕的数据
     */
    static compress(source: string | ArrayBuffer | NodeJS.ArrayBufferView) {
        return zlib.deflateSync(source);
    }
    /**
     * 解压给定数据
     * @param compressedData 
     * @param SourceDataType 源数据类型，包括：String, crByteArray, Buffer, ArrayBufferLike, JsonObjectType
     * @returns 
     */
    static uncompress<T>(compressedData: ArrayBuffer | NodeJS.ArrayBufferView, SourceDataType: AbstractOf<T>): T {
        let buff = zlib.inflateSync(compressedData);
        if (crUtil.subClassOf(SourceDataType, String)) {
            return buff.toString() as any as T;
        } else if (crUtil.subClassOf(SourceDataType, crByteArray)) {
            return new crByteArray(buff.buffer) as any as T;
        } else if (crUtil.subClassOf(SourceDataType, JsonObjectType)) {
            return JSON.parse(buff.toString());
        } else if (crUtil.subClassOf(SourceDataType, Buffer)) {
            return buff as any as T;
        }
        return buff.buffer as any as T;
    }
}