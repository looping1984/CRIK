import * as xlsx from "node-xlsx";
import { crPath } from "./crPath";
import { crStringBuilder } from "./crStringBuilder";

/**
 * table base 的类声明
 */
export interface IExcel2CSTableBaseClassInfo {
    /**
     * excel表名称（没有后缀）
     */
    readonly excelName: string;
    /**
     * 类声明的继承和扩展
     * @note 可修改
     */
    extends?: string;
}

/**
 * table base 的每个字段的定义详细信息
 */
export interface IExcel2CSTableBaseMemberInfo {
    /**
     * excel表名称（没有后缀）
     */
    readonly excelName: string;
    /**
     * 字段名称
     * @note 可修改
     */
    memberName: string;
    /**
     * 字段数值类型
     * @note 可修改
     */
    memberType: string;
    /**
     * 如果memberType是泛型列表，则表示元素类型
     * 如果memberType是泛型字段，则表示value类型
     * @note 可修改
     */
    elementType?: string;
    /**
     * 如果memberType是泛型字段，则表示key类型
     * @note 可修改
     */
    keyType?: string;
    /**
     * 字段是否被排除
     * @note 可修改
     */
    excluded: boolean;
}

/**
 * 参数选项
 */
export type Excel2CSOptions = {
    /**
     * TableBase模板，指定类名会类型替换其中的@{name} 内容替换@{content}
     */
    tableBaseTemplate: string;
    /**
     * TableBase模板，关键字段为id，指定类名会类型替换其中的@{name} 内容替换@{content}
     */
    tableBaseTemplateWithId: string;
    tableBaseTemplateWithLevel: string;
    /**
     * table模板，指定类名会类型替换其中的@{name}
     */
    tableTemplate: string;

    /**
     * 生成一个table base的类声明的过滤函数
     */
    tableBaseClassFilter?: (classInfo: IExcel2CSTableBaseClassInfo) => any;
    /**
     * 生成table base的每个字段时的过滤函数
     */
    tableBaseMemberFilter?: (memberInfo: IExcel2CSTableBaseMemberInfo) => any;
};
/**
 * 扫描js文件为json对象
 */
export class crXlsx2Json {
    static xlsxToJson(xlsxPath: string, tableName: string, options: Excel2CSOptions): { jsObj?: any, tableCode?: string, tableBaseCode?: string, error?: string } {
        if (typeof xlsxPath !== 'string' || !xlsxPath.endsWith(".xlsx")) {
            return { error: 'xlsx path invalid:' + xlsxPath };
        }
        let obj = xlsx.parse(xlsxPath);
        if (!obj) {
            return { error: 'read excel failed:' + xlsxPath };
        }

        let sheetData = obj[0].data;
        sheetData = crXlsx2Json.clipSheetData(sheetData);
        tableName || (tableName = crPath.getFilename(xlsxPath, true));
        let baseCode = crXlsx2Json._GenerateCs(tableName, sheetData, undefined, options);
        let code = options.tableTemplate.replace(/{name}/g, tableName);
        let jsObj = crXlsx2Json._StringifyObj(sheetData);
        return { jsObj: jsObj, tableCode: code, tableBaseCode: baseCode };
    }

    static _StringifyObj(sheetData) {
        let typeArr = sheetData[2];
        let retArr = [];
        for (let row = 3; row < sheetData.length; row++) {
            let obj = {};
            for (let column = 0; column < typeArr.length; column++) {
                let arrMatch = typeArr[column].match(/(?<=\[).*?(?=\])/);//数组
                let dictMatch = typeArr[column].match(/(?<=\{).*?(?=\})/);//对象
                let data = sheetData[row][column];
                if (dictMatch) {
                    let correctObj;
                    let type = dictMatch[0];
                    if (data !== undefined && data !== "") {
                        correctObj = {};
                        data = data.toString();
                        let arrData = data.split("|");
                        for (let i = 0; i < arrData.length; i++) {
                            let ct = crXlsx2Json._CorrectType(type, arrData[i]);
                            correctObj[ct.type] = ct.value;
                        }
                    }
                    obj[sheetData[1][column]] = correctObj;
                    // sheetData[row][column] = correctObj;
                } else if (arrMatch) {
                    let correctArr;
                    let type = arrMatch[0];
                    if (data !== undefined && data !== "") {
                        correctArr = [];
                        data = data.toString();
                        let arrData = data.split(",");
                        for (let i = 0; i < arrData.length; i++) {
                            correctArr.push(crXlsx2Json._CorrectType(type, arrData[i]));
                        }
                    }
                    // sheetData[row][column] = correctArr;
                    obj[sheetData[1][column]] = correctArr;
                }
                else {
                    obj[sheetData[1][column]] = crXlsx2Json._CorrectType(typeArr[column], data);
                    // sheetData[row][column] = crXlsx2Json._CorrectType(typeArr[column], data);
                }
            }
            retArr.push(obj);
        }
        return retArr;
    }

    static _GenerateCs(excelName, sheetData, indent = "\t", options: Excel2CSOptions) {
        let typeArr = sheetData[2];
        let prefix = "\t";
        // TableBase
        let findByID = false;
        let findByLevel = false;
        if (typeArr[0] == "N" || typeArr[0] == "n") {
            if (sheetData[1][0] == "id") {
                findByID = true;
            }
            if (sheetData[1][0] == "level") {
                findByLevel = true;
            }
        }
        console.log("find", findByLevel, findByID);
        let templeteStr = findByID ? options.tableBaseTemplateWithId : options.tableBaseTemplate;
        templeteStr = findByLevel ? options.tableBaseTemplateWithLevel : templeteStr;
        let csCode = templeteStr.replace(/@{name}/g, excelName)
        let classExtends: string = '';
        if (options.tableBaseClassFilter) {
            let classInfo: IExcel2CSTableBaseClassInfo = {
                excelName: excelName,
                extends: classExtends,
            };
            options.tableBaseClassFilter(classInfo);
            classExtends = classInfo.extends;
        }
        csCode = csCode.replace(/@{tableBaseClassExtends}/g, classExtends);
        let sb = new crStringBuilder();
        for (let column = 0; column < typeArr.length; column++) {
            let arrMatch = typeArr[column].match(/(?<=\[).*?(?=\])/);//数组
            let dictMatch = typeArr[column].match(/(?<=\{).*?(?=\})/);//对象
            let fdName = sheetData[1][column];
            if (dictMatch) {
                let type = dictMatch[0];
                let typeArr = type.split(",");
                let kt = crXlsx2Json._GenerateCsType(typeArr[0]);
                let vt = crXlsx2Json._GenerateCsType(typeArr[1]);
                let fdt = `CfgDictionaryT<${kt},${vt}>`;
                if (options.tableBaseMemberFilter) {
                    let memberInfo: IExcel2CSTableBaseMemberInfo = {
                        excelName: excelName,
                        memberName: fdName,
                        memberType: fdt,
                        keyType: kt,
                        elementType: vt,
                        excluded: false,
                    };
                    options.tableBaseMemberFilter(memberInfo);
                    if (memberInfo.excluded) {
                        continue;
                    }
                    fdName = memberInfo.memberName;
                    fdt = memberInfo.memberType;
                    vt = memberInfo.elementType;
                    kt = memberInfo.keyType;
                }
                sb.append(`${prefix}${indent}public ${fdt} ${fdName};\n`);
            } else if (arrMatch) {
                let type = arrMatch[0];
                let vt = crXlsx2Json._GenerateCsType(type);
                let fdt = `CfgList<${vt}>`;
                if (options.tableBaseMemberFilter) {
                    let memberInfo: IExcel2CSTableBaseMemberInfo = {
                        excelName: excelName,
                        memberName: fdName,
                        memberType: fdt,
                        elementType: vt,
                        excluded: false,
                    };
                    options.tableBaseMemberFilter(memberInfo);
                    if (memberInfo.excluded) {
                        continue;
                    }
                    fdName = memberInfo.memberName;
                    fdt = memberInfo.memberType;
                    vt = memberInfo.elementType;
                }
                sb.append(`${prefix}${indent}public ${fdt} ${fdName};\n`);
            }
            else {
                let type = typeArr[column];
                let vt = crXlsx2Json._GenerateCsType(type);
                if (options.tableBaseMemberFilter) {
                    let memberInfo: IExcel2CSTableBaseMemberInfo = {
                        excelName: excelName,
                        memberName: fdName,
                        memberType: vt,
                        excluded: false,
                    };
                    options.tableBaseMemberFilter(memberInfo);
                    if (memberInfo.excluded) {
                        continue;
                    }
                    fdName = memberInfo.memberName;
                    vt = memberInfo.memberType;
                }
                sb.append(`${prefix}${indent}public ${vt} ${fdName};\n`);
            }
        }
        return csCode.replace("@{content}", sb.toString());
    }

    static _GenerateCsType(type: string) {
        type = type.toLowerCase();
        if (type == "f") {
            return "float";
        }
        else if (type == "u") {
            return "ulong";
        }
        else if (type == "n") {
            return "int";
        }
        else if (type == "v3") {
            return "Vec3";
        }
        else if (type == "s") {
            return "string";
        }
        else if (type == "b") {
            return "bool";
        } else {
            return "object";
        }
    }

    static _CorrectType(type, data) {
        if (data == null) {
            return undefined;
        }
        let typeArr = type.split(",");
        if (typeArr.length > 1) {
            let obj = {};
            let dataArr = data.split(",");
            obj[crXlsx2Json._CorrectType(typeArr[0], dataArr[0])] =
                crXlsx2Json._CorrectType(typeArr[1], dataArr[1]);
            return obj;
        }
        else if (type == "F" || type == "f") {
            return parseFloat(data);
        }
        else if (type == "N" || type == "n") {
            return parseInt(data);
        }
        else if (type == "U" || type == "u") {
            return parseInt(data);
        }
        else if (type == "V3" || type == "v3") {
            let dataArr = data.split(",");
            if (dataArr.length == 3) {
                let x = parseFloat(dataArr[0]);
                let y = parseFloat(dataArr[1]);
                let z = parseFloat(dataArr[2]);
                return { x: x, y: y, z: z };
            } else if (dataArr.length == 2) {
                let x = parseFloat(dataArr[0]);
                let y = parseFloat(dataArr[1]);
                return { x: x, y: y, z: 0 };
            } else if (dataArr.length == 1) {
                let x = parseFloat(dataArr[0]);
                return { x: x, y: x, z: x };
            }
            return { x: 0, y: 0, z: 0 }
        }
        else if (type == "S" || type == "s") {
            return data.toString();
        }
        else if (type == "B" || type == "b") {
            return crXlsx2Json.StringToBoolean(data);
        }

        return data;
    }

    static StringToBoolean(str) {
        if (!str) {
            return false;
        }
        if (typeof str === 'string') {
            let s = str.trim().toLowerCase();
            return s !== 'false' && s !== 'False' && s !== 'FALSE';
        }
        return str;
    }

    /**
 * 裁剪sheet数据
 * 裁剪掉因为奇怪的空单元格或者单元格样式导致暴涨的行数或者列数
 * 同时也清掉首行中，以#开头的字段对应的列的数据，拿空值填充之
 * sheetData : [[],[],...]
 */
    static clipSheetData(sheetData: any[][]) {
        let lineCount = 0;
        let columCount = 0;

        let ignoredIndexArray = []; // 忽略的列坐标
        let expIndexArray = []; // 需要处理（压缩）科学计数法的列坐标
        // 计算行数
        for (let i = 0; i < sheetData.length; i++) {
            let lineData = sheetData[i];
            if (crXlsx2Json._IsEmptyCell(lineData[0])) {
                break;
            }

            if (i == 0) {
                // 在第一行中计算列数
                // 同时记录忽略的列坐标
                for (let j = 0; j < lineData.length; j++) {
                    if (crXlsx2Json._IsEmptyCell(lineData[j])) {
                        break;
                    }
                    if (crXlsx2Json._IsIgnoredField(lineData[j])) {
                        ignoredIndexArray.push(j);
                    }
                    if (crXlsx2Json._IsExpField(lineData[j])) {
                        expIndexArray.push(j);
                    }
                    columCount += 1;
                }

                // 再次矫正有效列数，如果忽略的列处于末尾并且是连续的，都不要了

                let beginTrim = false;
                for (let k = ignoredIndexArray.length - 1; k >= 0; k--) {
                    if (columCount - 1 == ignoredIndexArray[k]) {
                        beginTrim = true;
                        columCount -= 1;
                    }
                    else {
                        if (beginTrim == true) {
                            // 已经开始在修剪的时候，
                            // 如果当前倒序遍历的忽略列索引不是最新的尾列索引(columCount)，说明连续忽略结束了
                            break;
                        }
                    }
                }

            }

            lineCount += 1;
        }

        // 开始真正的裁剪

        // 先裁剪行数
        sheetData = sheetData.slice(0, lineCount);
        sheetData.splice(lineCount, sheetData.length - lineCount);

        // 裁剪列数，并用空值填充忽略字段列
        for (let i = 0; i < sheetData.length; i++) {
            let lineData = sheetData[i];
            lineData.splice(columCount, lineData.length - columCount);
            if (i == 0) {
                // 首行一般都是字段名，不作后续处理了
                continue;
            }

            // 忽略字段填充空值
            for (let j = 0; j < ignoredIndexArray.length; j++) {
                let columIndex = ignoredIndexArray[j];
                if (columIndex < lineData.length) {
                    lineData[columIndex] = crXlsx2Json._Blank();
                }
                else {
                    break;
                }
            }

            // 使用科学计数法压缩字段的内容，舍去一些尾数
            for (let j = 0; j < expIndexArray.length; j++) {
                let columIndex = expIndexArray[j];
                if (columIndex < lineData.length) {
                    if (lineData[columIndex] == null || lineData[columIndex] === 0) {
                        lineData[columIndex] = 0;
                        continue;
                    }
                    let n = parseFloat(lineData[columIndex]);
                    if (n >= 1000000) {
                        // 7位数开始才压缩， 保留2位小数的情况下，字符串最小长度比如"1.23e1"，为6位
                        lineData[columIndex] = crXlsx2Json._WrapExpString(n.toExponential(2));
                    }
                    else {
                        if (n >= 1000) {
                            lineData[columIndex] = Math.round(n);
                        }
                        else if (n >= 100) {
                            lineData[columIndex] = Math.round(n * 10) / 10;
                        }
                        else if (n >= 10) {
                            lineData[columIndex] = Math.round(n * 100) / 100;
                        }
                        else if (n >= 1) {
                            lineData[columIndex] = Math.round(n * 1000) / 1000;
                        }
                        else {
                            // 小于1 的数也直接用科学计数
                            lineData[columIndex] = crXlsx2Json._WrapExpString(n.toExponential(2));
                        }
                    }

                }
                else {
                    break;
                }
            }
        }

        return sheetData;
    }

    static _IsEmptyCell(cellData) {
        return cellData === null || cellData === undefined || (typeof cellData === "string" && cellData.replace(/\s/g, "").length == 0);
    }

    /**
     * 是否是忽略字段
     */
    static _IsIgnoredField(cellData) {
        return typeof cellData === "string" && cellData.length > 0 && cellData[0] === "#";
    }

    /**
     * 是否是需要使用科学计数法压缩的字段
     */
    static _IsExpField(cellData) {
        return typeof cellData === "string" && cellData.length > 0 && cellData[0] === "$";
    }

    /**
     * 返回用于填充的空值
     */
    static _Blank() {
        return 0;
    }

    /**
     * 包装下科学计数法字符串，
     * 把多余的+号去除，并在头尾作标记方便最后替换掉引号
     */
    static _WrapExpString(str) {
        str = str.replace("e+", "e")
        return "__$begin" + str + "__$end";
    }
}
