import ts = require("typescript");
import jpath = require("path");
import { AppendSlashType, crPath } from "../crPath";

/**
 * Typescript AST 解析辅助工具类
 */
export abstract class crASTHelper {
    /**
     * resolve import path
     * @param curTSAbsPath current ts source path - absolute path
     * @param importedTSRelativePath ts path to be imported - maybe relative to curTSAbsPath
     * @returns final path - absolute path of importedTSRelativePath
     */
    static resolveImportPath(curTSAbsPath: string, importedTSRelativePath: string) {
        if (!crPath.getExt(importedTSRelativePath)) {
            importedTSRelativePath = crPath.replaceExt(importedTSRelativePath, 'ts', true);
        }
        return crPath.standardize(jpath.resolve(crPath.getParentFolder(curTSAbsPath), importedTSRelativePath));
    }
    /**
     * 将import的绝对路径转化为相对路径
     * @param basePath 基准路径（绝对路径）。如果basePath是一个文件路径，则它所在的文件夹作为基准路径
     * @param tsPath 待转化的import绝对路径
     * @param withExtend 是否保留tsPath的后缀，默认不保留。如果传字符串，表示替换为给定的后缀
     * @returns tsPath相对basePath的路径
     */
    static relativeImportPath(basePath: string, tsPath: string, withExtend?: boolean | string) {
        if (crPath.getExt(basePath)) {
            basePath = crPath.getParentFolder(basePath);
        }
        let ext = crPath.getExt2(tsPath);
        if (typeof withExtend !== 'string') {
            if (withExtend === true) {
                withExtend = ext || 'ts';
            } else {
                withExtend = '';
            }
        }
        ext = withExtend;
        let relative = jpath.relative(basePath, tsPath);
        relative = crPath.replaceExt2(relative, ext, AppendSlashType.Never);
        if (!relative.startsWith('.')) {
            if (!relative.startsWith('/')) {
                relative = '/' + relative;
            }
            relative = '.' + relative;
        }
        return relative;
    }
    static parseIdetifierText(node: ts.Node) {
        if (!node) {
            return undefined;
        }
        if (ts.isIdentifier(node)) {
            return node.text;
        }
        if (ts.isStringLiteral(node)) {
            return node.text;
        }
        return undefined;
    }
    static parseDeclareName(node: ts.Node) {
        if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isClassDeclaration(node)) {
            return crASTHelper.parseIdetifierText(node.name);
        }
        return undefined;
    }
    static isStatic(n: ts.Node) {
        if (n && n.modifiers) {
            for (let m of n.modifiers) {
                if (m.kind === ts.SyntaxKind.StaticKeyword) {
                    return true;
                }
            }
        }
        return false;
    }
    static isExported(n: ts.Node) {
        if (n && n.modifiers) {
            for (let m of n.modifiers) {
                if (m.kind === ts.SyntaxKind.ExportKeyword) {
                    return true;
                }
            }
        }
        return false;
    }
    static isDefault(n: ts.Node) {
        if (n && n.modifiers) {
            for (let m of n.modifiers) {
                if (m.kind === ts.SyntaxKind.DefaultKeyword) {
                    return true;
                }
            }
        }
        return false;
    }
    static isAbstract(n: ts.Node) {
        if (n && n.modifiers) {
            for (let m of n.modifiers) {
                if (m.kind === ts.SyntaxKind.AbstractKeyword) {
                    return true;
                }
            }
        }
        return false;
    }
}
