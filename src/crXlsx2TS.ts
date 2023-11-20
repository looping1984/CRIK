import * as xlsx from "node-xlsx";
import { crPath } from "./crPath";
import { DeepReadonly, crUtil, is_null, not_null } from "./crUtil";
import { crXlsx2Json } from "./crXlsx2Json";
import { crFS } from "./crFS";
import { js_beautify } from "js-beautify";

export type crXTSPrimitiveType = 'string' | 'number' | 'boolean' | 'any' | 'error';
export type crXTSMemberType = crXTSPrimitiveType | ({ fd: string, type: crXTSPrimitiveType }[]);
export type crXTSContainerType = 'primitive' | 'array';
export type crXTSTableResult = { json: any, typing: string };

/**
 * tabel表里一个成员遍历（一列）的信息
 */
export interface crXTSTableItemMember {
    /**
     * 成员名称
     */
    readonly name: string;
    /**
     * 注释
     */
    readonly comment: string;
    /**
     * 每个元素类型
     */
    readonly element: crXTSMemberType;
    /**
     * 容器类型
     */
    readonly container: crXTSContainerType;
    /**
     * 特殊标志
     */
    readonly flags: string;
    /**
     * 是否被排除
     */
    readonly excluded?: boolean;
}

/**
 * 一个table表的信息
 */
export interface crXTSTableClass {
    /**
     * excel文件路径
     */
    readonly filePath: string;
    /**
     * 表json对象的名称
     */
    entryName: string;
    /**
     * table 类名
     */
    className: string;
    /**
     * 注释，可选
     */
    comment?: string;
    /**
     * 额外的代码，可选
     */
    extraBody?: string;
    /**
     * table item 类名
     */
    itemClass: string;
    /**
     * table item 类 的额外代码
     */
    itemExtraBody?: string;
    /**
     * table item 的注释
     */
    itemComment?: string;
    /**
     * 成员列表
     */
    members: crXTSTableItemMember[];
}

/**
 * excel to ts 的选项
 */
export interface crXTSOptions {
    /**
     * excel源文件列表或者文件夹
     */
    excel: string | string[];
    /**
     * 待输出的json文件，可选。不填则不输出
     */
    outJson?: string;
    /**
     * 待输出的typing文件夹根路径，可选。不填则不输出
     */
    outTyping?: string;
    /**
     * 写入新的typing之前是否清理老的，默认false
     */
    clearOldTypings?: boolean;
    /**
     * table 类的模板
     */
    tableClassTemplate?: string;
    /**
     * table item 类的模板
     */
    tableItemTemplate?: string;
    /**
     * table item 的成员名称行索引，可选。默认1（即第二行）
     */
    memberNameRow?: number;
    /**
     * table item 的成员注释行索引，可选。默认0（即第一行）。小于0表示不存在
     */
    memberCommentRow?: number;
    /**
     * excel表真正内容所在的sheet索引，可选。默认0
     */
    excelSheet?: number;
    /**
     * 对table解析的预处理
     * @param excelPath excel路径
     * @param tableClass table类信息，可修改
     */
    onBeforeTable?: (excelPath: string, tableClass: crXTSTableClass) => any;
    /**
     * 处理excel的结果的回调
     * @param excelPath 当前处理的excel路径 
     * @param tableClass 解析的excel对应的table类
     * @param result 解析结果，可以更改
     */
    onTable?: (excelPath: string, tableClass: DeepReadonly<crXTSTableClass>, result: crXTSTableResult) => any;
    /**
     * 自定义复杂类型
     * @param str 
     */
    onCustomType?: (type: string) => string;
}

type _crJsonRes = {
    err?: string;
    json?: any;
}

/**
 * excel 到 json 和 typing 的转换
 */
export class crXlsx2TS {
    /**
     * 执行excel -> json & ts-typing 转换
     * @param options 相关参数
     */
    static transform(options: crXTSOptions) {
        if (!options) {
            return '参数为空';
        }
        if (!options.outJson && !options.outTyping && !options.onTable && !options.onBeforeTable) {
            return '传入的参数选项不用做任何处理';
        }
        if (typeof options.excel === 'string') {
            //一个路径
            options.excel = crPath.collectGoodFiles(options.excel, '.xlsx', true, false);
        }
        if (!options.excel) {
            return 'options.excel 未空';
        }
        typeof options.memberNameRow !== 'number' && (options.memberNameRow = 1);
        typeof options.memberCommentRow !== 'number' && (options.memberCommentRow = 0);
        if (options.memberNameRow === options.memberCommentRow) {
            return `options.memberNameRow == options.memberCommentRow`;
        }
        const custom_transform = options.onCustomType;
        options.onCustomType = function (srcType) {
            custom_transform && (srcType = custom_transform(srcType));
            return crXlsx2TS._transform_normal_type(srcType);
        };
        typeof options.excelSheet !== 'number' && (options.excelSheet = 0);
        let json: Record<string, any> = options.outJson ? {} : undefined;
        let typing: Record<string, string> = options.outTyping ? {} : undefined;
        for (let excelPath of options.excel) {
            let tres = crXlsx2TS._transform_table(excelPath, options);
            if (tres.err) {
                return tres.err;
            }
            if (json) {
                const entry = tres.tableClass.entryName;
                if (json[entry]) {
                    return `table entry duplicated: ${entry}`;
                }
                json[entry] = tres.tableResult.json;
            }
            if (typing) {
                const entry = tres.tableClass.className;
                if (typing[entry]) {
                    return `table name duplicated: ${entry}`;
                }
                typing[entry] = tres.tableResult.typing;
            }
        }
        if (json) {
            if (!crFS.write_json(options.outJson, json, false, true, true)) {
                return `write json failed: ${options.outJson}`;
            }
        }
        if (typing) {
            if (options.clearOldTypings) {
                if (!crPath.clearFolder(options.outTyping)) {
                    return `clear typing folder failed: ${options.outTyping}`;
                }
            }
            for (let typePath in typing) {
                let tsSource = typing[typePath];
                tsSource = js_beautify(tsSource);
                typePath = crPath.join(options.outTyping, typePath + '.ts');
                if (!crFS.write_text(typePath, tsSource)) {
                    return `write typescript failed: ${typePath}`;
                }
            }
        }
        return undefined;
    }
    private static _transform_table(excelPath: string, options: crXTSOptions) {
        let excel = xlsx.parse(excelPath);
        if (!excel) {
            return { err: `xlsx.parse failed: ${excelPath}` };
        }
        let sheet: { name: string, data: string[][] } = excel[options.excelSheet];
        if (!sheet) {
            return { err: `excel.sheet[${options.excelSheet}] not exist: ${excelPath}` };
        }
        let sheetData = crXlsx2Json.clipSheetData(sheet.data);
        const tableName = crPath.getFilename(excelPath, true);
        let tableClass: crXTSTableClass = {
            filePath: excelPath,
            entryName: tableName,
            className: `${tableName}Table`,
            itemClass: `${tableName}TableItem`,
            members: [],
        };
        const m_res = crXlsx2TS._parse_member_defines(tableClass, sheetData, options);
        if (m_res.err) {
            return {
                err: m_res.err,
            };
        }
        options.onBeforeTable && options.onBeforeTable(excelPath, tableClass);
        let result: crXTSTableResult = {
            json: undefined,
            typing: undefined,
        };
        if (options.outJson || options.onTable) {
            //process json
            let res: _crJsonRes = {};
            crXlsx2TS._generate_table_json(tableClass, sheetData, options, res);
            if (res.err) {
                return { err: res.err };
            }
            result.json = res.json;
        }
        if (options.outTyping || options.onTable) {
            //process typing
            result.typing = crXlsx2TS._generate_table_typing(tableClass, options);
        }
        return {
            tableClass: tableClass,
            tableResult: result,
        };
    }

    private static _generate_table_typing(tableClass: crXTSTableClass, options: crXTSOptions) {
        const item_typing = crXlsx2TS._generate_table_item_class(tableClass, options);
        const table_typing = crXlsx2TS._generate_table_class(tableClass, options);
        let typing = str_replace_all(t_typing_template, '{item_typing}', item_typing);
        typing = str_replace_all(typing, '{table_typing}', table_typing);
        return typing;
    }
    private static _generate_table_item_class(tableClass: crXTSTableClass, options: crXTSOptions) {
        let typing = options.tableItemTemplate || t_item_class_template;
        typing = str_replace_all(typing, '{class}', tableClass.itemClass);
        typing = str_replace_all(typing, '{comment}', tableClass.itemComment || `Row define of ${tableClass.className}`);
        typing = str_replace_all(typing, '{extra}', tableClass.itemExtraBody);
        let body = '';
        for (let m of tableClass.members) {
            let md = str_replace_all(t_item_fd_template, '{fd}', m.name);
            md = str_replace_all(md, '{type}', crXlsx2TS._to_typing(m.element));
            md = str_replace_all(md, '{container}', m.container === 'array' ? '[]' : '');
            md = str_replace_all(md, '{comment}', m.comment);
            body && (body += '\n');
            body += md;
        }
        typing = str_replace_all(typing, '{public}', body);
        return typing;
    }
    private static _generate_table_class(tableClass: crXTSTableClass, options: crXTSOptions) {
        let typing = options.tableClassTemplate || t_table_class_template;
        typing = str_replace_all(typing, '{class}', tableClass.className);
        typing = str_replace_all(typing, '{comment}', tableClass.comment || `Table ${tableClass.className}`);
        typing = str_replace_all(typing, '{extra}', tableClass.extraBody);
        let private_code = str_replace_all(t_row_member_template, '{item_class}', tableClass.itemClass);
        let public_code = str_replace_all(t_row_parse_template, '{item_class}', tableClass.itemClass);
        let parse_more = '';
        for (let m of tableClass.members) {
            if (m.flags.includes('p')) {
                //主索引
                //声明变量代码
                let code = str_replace_all(t_dic_member_template, '{fd}', m.name);
                code = str_replace_all(code, '{item_class}', tableClass.itemClass);
                code = str_replace_all(code, '{fd_type}', crXlsx2TS._to_typing(m.element));
                private_code && (private_code += '\n');
                private_code += code;

                //解析代码
                code = str_replace_all(t_dic_parse_template, '{fd}', m.name);
                code = str_replace_all(code, '{fd_type}', crXlsx2TS._to_typing(m.element));
                parse_more && (parse_more += '\n');
                parse_more += code;

                //find代码
                code = str_replace_all(t_dic_find_template, '{fd}', m.name);
                code = str_replace_all(code, '{fd_type}', crXlsx2TS._to_typing(m.element));
                code = str_replace_all(code, '{fd_comment}', m.comment);
                public_code && (public_code += '\n');
                public_code += code;
            } else if (m.flags.includes('s')) {
                //普通查找
                let code = str_replace_all(t_find_template, '{fd}', m.name);
                code = str_replace_all(code, '{fd_type}', crXlsx2TS._to_typing(m.element));
                code = str_replace_all(code, '{fd_comment}', m.comment);
                public_code && (public_code += '\n');
                public_code += code;
            }
        }
        public_code = str_replace_all(public_code, '{parse_more}', parse_more);
        typing = str_replace_all(typing, '{private}', private_code);
        typing = str_replace_all(typing, '{public}', public_code);
        typing = str_replace_all(typing, '{extra}', tableClass.extraBody);
        return typing;
    }

    private static _generate_table_json(tableClass: crXTSTableClass, sheet: any[][], options: crXTSOptions, tableRes: _crJsonRes) {
        tableRes.err = undefined;
        tableRes.json = undefined;
        let itemRes: _crJsonRes = {};
        let cellRes: _crJsonRes = {};
        let table_json: any[] = [];
        let idx = Math.max(0, Math.max(options.memberNameRow, options.memberCommentRow) + 1);
        for (; idx < sheet.length; ++idx) {
            crXlsx2TS._generate_table_item_json(tableClass, sheet[idx], idx, options, itemRes, cellRes);
            if (itemRes.err) {
                tableRes.err = itemRes.err;
                return;
            }
            table_json.push(itemRes.json);
        }
        tableRes.json = table_json;
    }
    private static _generate_table_item_json(tableClass: crXTSTableClass, row: any[], rowIdx: number, options: crXTSOptions, itemRes: _crJsonRes, tempCellRes: _crJsonRes) {
        itemRes.err = undefined;
        itemRes.json = undefined;
        let item_json: Record<string, any> = {};
        for (let i = 0; i < tableClass.members.length; ++i) {
            const member = tableClass.members[i];
            if (member.excluded) {
                continue;
            }
            crXlsx2TS._generate_table_item_fd_json(tableClass, member, row[i] || '', rowIdx, i, options, tempCellRes);
            if (tempCellRes.err) {
                itemRes.err = tempCellRes.err;
                return;
            }
            item_json[member.name] = tempCellRes.json;
        }
        itemRes.json = item_json;
    }
    private static _generate_table_item_fd_json(tableClass: crXTSTableClass, member: crXTSTableItemMember, cell: any, rowIdx: number, cellIdx: number, options: crXTSOptions, res: _crJsonRes) {
        res.err = undefined;
        res.json = undefined;
        if (member.container === 'primitive') {
            //普通元素
            res.json = crXlsx2TS._parse_cell(member.element, cell, !member.flags.includes('i'));
        } else if (member.container === 'array') {
            //数组
            if (not_null(cell) && (cell = cell.toString().trim())) {
                res.json = [];
                let spliter: RegExp;
                if (typeof member.element !== 'string' || member.element === 'any' || member.element === 'string') {
                    spliter = /[|]/;
                } else {
                    spliter = /[,;|\s]/;
                }
                const cells = cell.split(spliter);
                for (let c of cells) {
                    c = c.trim();
                    if (!c) {
                        continue;
                    }
                    res.json.push(crXlsx2TS._parse_cell(member.element, c, false));
                }
            }
            !res.json && member.flags.includes('i') && (res.json = []);
        } else {
            //未知
            res.err = `未知字段容器类型：${member.container}. [${rowIdx}][${cellIdx}]${tableClass.filePath}`;
        }
    }
    private static _parse_cell(type: crXTSMemberType, cell: any, optional: boolean) {
        if (typeof type === 'string') {
            return crXlsx2TS._parse_primitive_cell(type, cell);
        }
        cell || (cell = '');
        cell = cell.toString().trim();
        if (!cell && optional) {
            return undefined;
        }
        let obj: Record<string, any> = {};
        let spliter: RegExp;
        for (let i = 0; i < type.length; ++i) {
            const c = type[i].type;
            if (c === 'string' || c === 'any') {
                spliter = /[|]/;
                break;
            }
        }
        spliter || (spliter = /[,;|\s]/);
        const tuples = cell.split(spliter);
        for (let i = 0; i < type.length; ++i) {
            const c = type[i];
            obj[c.fd] = crXlsx2TS._parse_primitive_cell(c.type, tuples[i]);
        }
        return obj;
    }
    private static _parse_primitive_cell(type: crXTSPrimitiveType, cell: any) {
        is_null(cell) && (cell = '');
        if (type === 'string') {
            return cell.toString();
        }
        typeof cell === 'string' && (cell = cell.trim());
        if (type === 'boolean') {
            if (typeof cell === 'string') {
                cell = cell.trim().toLowerCase();
                return !!(cell && cell !== 'false' && cell !== '0');
            } else {
                return !!cell;
            }
        } else if (type === 'number') {
            if (typeof cell === 'number') {
                return cell;
            }
            if (typeof cell === 'string') {
                return parseFloat(cell) || 0;
            }
            return 0;
        } else if (type === 'any') {
            if (typeof cell === 'string') {
                return crUtil.parseJson(cell);
            }
            return undefined;
        }
        return undefined;
    }
    private static _parse_member_defines(tableClass: crXTSTableClass, sheet: string[][], options: crXTSOptions) {
        const memberRow = sheet[options.memberNameRow];
        if (!memberRow) {
            return { err: `excel.sheet[${options.memberNameRow}] member name row not exist: ${tableClass.filePath}` };
        }
        const commentRow = sheet[options.memberCommentRow] || [];
        for (let i = 0; i < memberRow.length; ++i) {
            const cell = memberRow[i];
            let res = crXlsx2TS._parse_member_define(cell, commentRow[i], options);
            if (res.err) {
                return { err: `${res.err}. ${tableClass.filePath}` };
            }
            tableClass.members.push(res as crXTSTableItemMember);
        }
        return { err: undefined };
    }
    private static _parse_member_define(cell: string, comment: string, options: crXTSOptions): Partial<crXTSTableItemMember> & { err?: string } {
        const triple = cell.split('|');
        const name = triple[0];
        let typeRes = crXlsx2TS._parse_member_type(triple[1], options);
        if (typeRes.err) {
            return {
                err: `excel.parse member error: ${typeRes.err}`,
            };
        }
        const flags = (triple[2] || '').toLowerCase();
        return {
            name: name,
            comment: comment || name,
            element: typeRes.type,
            container: typeRes.container,
            flags: flags,
            excluded: flags.includes('x'),
        };
    }
    private static _parse_member_type(str: string, options: crXTSOptions): { err?: string, type?: crXTSMemberType, container?: crXTSContainerType } {
        str = (str || '').trim();
        let container: crXTSContainerType = 'primitive';
        const c_reg = /\[\s*\]/;
        const reg_res = c_reg.exec(str);
        if (reg_res) {
            str = str.substring(0, reg_res.index);
            container = 'array';
        }
        let type: crXTSMemberType = crXlsx2TS._parse_primitive_type(str);
        if (type !== 'error') {
            return {
                type: type,
                container: container,
            }
        }
        str = (options.onCustomType || crXlsx2TS._transform_normal_type)(str);
        const words = str.split(/[^\w]+/);
        if (words.length % 2) {
            return {
                err: `error member type: ${str}`,
            };
        }
        type = [];
        let i = 0;
        while (i < words.length) {
            const fd = words[i++];
            const fdtype = crXlsx2TS._parse_primitive_type(words[i++]);
            if (fdtype === 'error') {
                return {
                    err: `error member type: ${str}`,
                };
            }
            type.push({
                fd: fd,
                type: fdtype,
            });
        }
        return {
            type: type,
            container: container,
        };
    }

    private static _transform_normal_type(ostr: string) {
        let str = ostr;
        str = (str || '').trim().toLowerCase();
        if (str === 'v2') {
            return 'x:n y:n';
        }
        if (str === 'v3') {
            return 'x:n y:n z:n';
        }
        if (str === 'item') {
            return 'id:n, num:n';
        }
        return ostr;
    }
    private static _to_typing(type: crXTSMemberType) {
        if (typeof type === 'string') {
            return type;
        }
        let str = '{';
        for (let c of type) {
            str += `${c.fd}: ${crXlsx2TS._to_typing(c.type)},`;
        }
        str += '}';
        return str;
    }
    private static _parse_primitive_type(str: string): crXTSPrimitiveType {
        str = (str || '').trim().toLowerCase();
        if (!str || str === 's' || str === 'string') {
            return 'string';
        }
        else if (str === 'n' || str === 'number') {
            return 'number';
        }
        else if (str === 'b' || str === 'bool' || str === 'boolean') {
            return 'boolean';
        }
        else if (str === 'object' || str === 'any' || str === 'json') {
            return 'any';
        } else {
            return 'error';
        }
    }
}

function str_replace_all(str: string, search: string, replace: string) {
    if (!str) {
        return str;
    }
    replace || (replace = '');
    return str.replaceAll(search, replace);
    // let idx = 0;
    // while (idx < str.length) {
    //     idx = str.indexOf(search, idx);
    //     if (idx === -1) {
    //         break;
    //     }
    //     str = str.substring(0, idx) + replace + str.substring(idx + search.length);
    //     idx += replace.length;
    // }
    // return str;
}

const t_typing_template =
    `/*
 * 当前代码由 CRIK 工具自动生成
 * CRIK: http://git.kuzhengame.com/KZTools/Crik
 */

{item_typing}

{table_typing}
`

const t_item_class_template =
    `/**
 * {comment}
 */
export type {class} = {
    {public}
    {extra}
}`

const t_item_fd_template =
    `/**
 * {comment}
 */
readonly {fd}: {type}{container};`

const t_table_class_template =
    `/**
 * {comment}
 */
export class {class}{
    {private}
    constructor() {
    }

    {public}
    {extra}

    /**
     * 数据表解析完毕后的处理
     * @tooverride
     */
    protected onParsed() { }
}`;

const t_row_member_template =
    `   /**整个表所有的行*/
    private _rows: {item_class}[];`;

const t_row_parse_template =
    `/**
     * 初始化并解析数据表
     * @param rows 数据表所有的有意义的行
     * @note 注意，rows会直接被当前表对象持有，外部不能随意更改
     */
    parse(rows: {item_class}[]) {
        //所有的行
        this._rows = rows;

        //以下是一些自动生成的额外处理，包括构建特殊的索引（以加快运行时数据查找）
        {parse_more}

        //最后，子类可以考虑额外的初始化
        this.onParsed();
    }
    /**
     * 整个表所有的数据行，返回所有行的只读数组
     */
    get rows(): ReadonlyArray<{item_class}> {
        return this._rows;
    }
    /**
     * 查找符合条件的行
     * @param predicate 条件判断函数
     * @returns 符合条件的行，没有找到返回undefined
     */
    find(predicate: (e: {item_class}, index: number, rows: {item_class}[]) => boolean) {
        return this._rows.find(predicate);
    }
    `

const t_find_template =
    `/**
     * 通过字段{fd}查找数据行
     * @param {fd} 数据行的{fd_comment}
     * @returns （第一个）字段{fd}为给定数值的行，找不到就返回undefined
     * @note 时间复杂度为O(n)
     */
    find_by_{fd}({fd}: {fd_type}) {
        return this._rows.find(e => e.{fd}=== {fd});
    }`;

const t_dic_member_template =
    `   private _{fd}Dic: Record<{fd_type}, {item_class}>;`;

const t_dic_parse_template =
    `    this._{fd}Dic = {};
        for (let row of rows) {
            this._{fd}Dic[row.{fd}] = row;
        }`;

const t_dic_find_template =
    `/**
     * 以字段{fd}为key的字典
     */
    get {fd}Dic() {
        return this._{fd}Dic;
    }
    /**
     * 通过字段{fd}查找数据行
     * @param {fd} 数据行的{fd_comment}
     * @returns 字段{fd}为给定数值的行，找不到就返回undefined
     * @note 时间复杂度为O(1)
     */
    find_by_{fd}({fd}: {fd_type}) {
        return this._{fd}Dic[{fd}];
    }`