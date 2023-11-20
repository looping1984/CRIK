import * as fs from "fs";
import * as xml2js from "xml2js";
import { crMoreUtil } from "./crMoreUtil";
import { crPath } from "./crPath";
import { is_null } from "./crUtil";

/**
 * 输入输出相关操作
 */
export class crFS {
    /**
     * 是否输出详细信息，默认false
     */
    static logDetailed: boolean = false;

    /**
     * 读取二进制文件
     * @param path 文本文件路径
     * @return 文本内容，读取失败返回undefined
     */
    static read_binary(path: string) {
        if (!fs.existsSync(path)) {
            return undefined;
        }
        return fs.readFileSync(path);
    }

    /**
     * 写入二进制文件
     * @param path 文本文件路径
     * @param buff 任何内容 String|Buffer|TypedArray|DataView
     * @param encoding 文件编码，'binary'(默认) 或者 'utf8'
     * @param depressLog 是否抑制普通日志，默认false
     * @param checkMD5 是否检查文件内容是否改变，不改变就不写入，默认false，表示用于都尝试写入
     * @return 写入成功返回true
     */
    static write_binary(path: string, buff: string | NodeJS.ArrayBufferView, encoding?: BufferEncoding, depressLog?: boolean, checkMD5?: boolean) {
        if (is_null(buff)) {
            console.error('待输出的内容为空', path);
            return false;
        }
        if (fs.existsSync(path)) {
            if (checkMD5) {
                let exist = crFS.read_binary(path);
                let existMD5 = crMoreUtil.md5(exist);
                let curMD5 = crMoreUtil.md5(buff);
                if (existMD5 === curMD5) {
                    crFS.logDetailed && console.log(`文件未改动: ${path}`);
                    return true;
                }
            }
            fs.unlinkSync(path);
        }
        crPath.createFolder(crPath.getParentFolder(path));
        fs.writeFileSync(path, buff, {
            encoding: encoding || 'binary',
        });
        if (!depressLog) {
            if (path.indexOf('publish/.') === -1) {
                console.log('生成文件成功:', path);
            } else {
                console.log('写入缓存成功:', path);
            }
        }
        return true;
    }

    /**
     * 读取文本文件
     * @param path 文本文件路径
     * @param encoding 编码，默认utf8
     * @return 文本内容，读取失败返回undefined
     */
    static read_text(path: string, encoding?: BufferEncoding) {
        if (!fs.existsSync(path)) {
            console.warn(`file not exist: ${path}`);
            return undefined;
        }
        let buff = crFS.read_binary(path);
        return buff ? buff.toString(encoding || 'utf8') : undefined;
    }

    /**
     * 将文件写入到给定路径的文件中
     * @param path 目标文件路径
     * @param text 文本内容
     * @param depressLog 是否抑制普通日志，默认false
     * @param checkMD5 是否检查文件内容是否改变，不改变就不写入，默认false，表示用于都尝试写入
     * @return 写入成功返回true
     */
    static write_text(path: string, text: string, depressLog?: boolean, checkMD5?: boolean) {
        return crFS.write_binary(path, text, 'utf8', depressLog, checkMD5);
    }

    /**
     * 解析xml文件为一个json
     * @param path xml文件路径
     * @return json对象，失败返回undefined
     */
    static read_xml(path: string) {
        let content = crFS.read_text(path);
        if (!content) {
            return false;
        }
        let parser = new xml2js.Parser();
        let ret = undefined;
        parser.parseString(content, function (err, result) {
            if (!is_null(err)) {
                console.log('解析xml文件失败', path, err);
            }
            else if (result === undefined) {
                console.log('解析xml文件null：', path);
            }
            ret = result;
        });
        return ret;
    }

    /**
     * 将给定json对象保存到xml中
     * @param path xml输出路径 
     * @param json 对象
     * @param depressLog 是否抑制普通日志，默认false
     * @param checkMD5 是否检查文件内容是否改变，不改变就不写入，默认false，表示用于都尝试写入
     * @return 保存成功返回true
     */
    static write_xml(path: string, json: any, depressLog?: boolean, checkMD5?: boolean) {
        if (!json) {
            console.log('xml对象为空');
            return false;
        }
        let b = new xml2js.Builder(json);
        let xml = b.buildObject(json);
        if (!xml) {
            console.log('json对象转化为xml失败');
            return false;
        }
        return crFS.write_text(path, xml, depressLog, checkMD5);
    }

    /**
     * 读取json文件
     * @param path json文件路径
     * @return json对象，失败返回undefined
     */
    static read_json(path: string) {
        let str = crFS.read_text(path);
        if (is_null(str)) {
            return undefined;
        }
        try {
            return JSON.parse(str);
        } catch (e) {
            console.error(e);
            return undefined;
        }
    }

    /**
     * 写入json到文件
     * @param path 目标文件路径
     * @param json 待写入的对象
     * @param indent 是否优化json字符串格式，默认false，填true或者填字符串表示需要
     * @param depressLog 是否抑制普通日志，默认false
     * @param checkMD5 是否检查文件内容是否改变，不改变就不写入，默认false，表示用于都尝试写入
     * @return 写入成功返回true
     */
    static write_json(path: string, json: any, indent?: boolean | string, depressLog?: boolean, checkMD5?: boolean) {
        if (is_null(json)) {
            console.log('json对象为空，写入文件失败');
            return false;
        }
        return crFS.write_text(path, JSON.stringify(json, undefined, indent === true ? '  ' : indent === false ? undefined : indent), depressLog, checkMD5);
    }
}