import { createSolutionBuilderHost, transform } from "typescript";
import { crFS } from "../crFS";
import { crMoreUtil } from "../crMoreUtil";
import { AppendSlashType, crPath } from "../crPath";
import { crASTHelper } from "./crASTHelper";
import { crTSExportParser, crTSImportLine } from "./crTSExportParser";
import { crTSReader } from "./crTSReader";

/**
 * 
 */
export abstract class crTSImportResolver {
    static resolve(tsPath: string, resolver: (impt: crTSImportLine) => any, dstPath?: string): { err?: string, code?: string } {
        let sourceInfo = crTSReader.extractTrinity(tsPath);
        if (sourceInfo.error) {
            return {
                err: sourceInfo.error,
            };
        }
        let tsSource = crTSExportParser.parseFromContent(sourceInfo.imports, tsPath);
        let imports = '';
        for (let impt of tsSource.imports) {
            resolver(impt);
            let line = crTSExportParser.buildImportLine(impt);
            imports += line + '\n';
        }
        sourceInfo.header && (sourceInfo.header += '\n');
        imports && (imports += '\n');
        let source = `${sourceInfo.header}${imports}${sourceInfo.body}`;
        if (dstPath) {
            if (!crFS.write_text(dstPath, source, false, true)) {
                return {
                    err: `write source failed: ${dstPath}`,
                };
            }
        }
        return {
            code: source,
        };
    }

    static moveTSto(srcRoot: string, from: string, to: string): void {
        // Get absolute paths for the source and destination folders
        const absSrcRoot = crPath.absPath(srcRoot, AppendSlashType.Rudely);
        const absFrom = crPath.join(absSrcRoot, from, AppendSlashType.Rudely);
        const absTo = crPath.join(absSrcRoot, to, AppendSlashType.Rudely);

        let from2to: Record<string, string> = {};
        let to2from: Record<string, string> = {};
        // Traverse all TypeScript files in the source folder
        crPath.traverseGoodFile(absFrom, 'ts', true, (tsAbsPath, tsRelPath, tsFilename) => {
            // Get the absolute path and relative path of the destination file
            const tsDstPath = crPath.join(absTo, tsRelPath);

            // Resolve imports in the source file and modify them to be relative to the destination file
            crTSImportResolver.resolve(tsAbsPath, (impt) => {
                let absImportPath = impt.tsPath;
                if (absImportPath.startsWith(absFrom)) {
                    absImportPath = absTo + absImportPath.substring(absFrom.length);
                }
                const relImportPath = crASTHelper.relativeImportPath(tsDstPath, absImportPath);
                impt.modualPath = relImportPath;
            }, tsDstPath);

            from2to[tsAbsPath] = tsDstPath;
            to2from[tsDstPath] = tsAbsPath;
        });

        // Modify imports in other TypeScript files to be relative to the destination file
        crPath.traverseGoodFile(absSrcRoot, 'ts', true, (absTSPath, relTSPath, tsFilename) => {
            if (from2to[absTSPath] || to2from[absTSPath]) {
                return;
            }
            let changed = false;
            const res = crTSImportResolver.resolve(absTSPath, (impt) => {
                let toPath = from2to[impt.tsPath];
                if (toPath) {
                    impt.modualPath = crASTHelper.relativeImportPath(absTSPath, toPath);
                    changed = true;
                }
            });
            if (changed) {
                crFS.write_text(absTSPath, res.code);
            }
        });

        //delete from folder
        crPath.delete(absFrom);
    }
}

function test1() {
    console.log(process.cwd());
    const fromFolder = crPath.absPath('res/Script/Client/Src/Scene', AppendSlashType.Rudely);
    const toFolder = crPath.absPath('res/Script/Client/Src/GamePlay/Scene', AppendSlashType.Rudely);
    crPath.traverseGoodFile(fromFolder, 'ts', true, (tsAbsPath, tsRelPath, _) => {
        const tsToPath = crPath.join(toFolder, tsRelPath);
        crTSImportResolver.resolve(tsAbsPath, (impt) => {
            let absImportPath = impt.tsPath;
            if (absImportPath.startsWith(fromFolder)) {
                absImportPath = toFolder + absImportPath.substring(fromFolder.length);
            }
            let relImportPath = crASTHelper.relativeImportPath(tsToPath, absImportPath);
            impt.modualPath = relImportPath;
        }, tsToPath);
    });
}

function test2() {
    console.log(process.cwd());
    const fromRoot = crPath.absPath('E:/Demon/assets/Script/Server/', AppendSlashType.Rudely);
    const toRoot = crPath.absPath('E:/Demon/assets/Script/Server/AntGame/', AppendSlashType.Rudely);

    crPath.clearFolder(toRoot);
    crPath.traverseGoodFile(fromRoot, 'ts', true, (tsAbsPath, tsRelPath, _) => {
        let tsDstPath = crPath.join(toRoot, tsRelPath);
        let source = crTSImportResolver.resolve(tsAbsPath, (impt) => {
            let absImportPath = impt.tsPath;
            if (absImportPath.startsWith(fromRoot)) {
                return;
            }
            let relImportPath = crASTHelper.relativeImportPath(tsDstPath, absImportPath);
            //console.log(impt.modualPath, '->', relImportPath);
            impt.modualPath = relImportPath;
        });
        if (source.err) {
            console.error(`[Error]${tsAbsPath}: ${source.err}`);
        } else {
            crFS.write_text(tsDstPath, source.code);
        }
    });
}

function test3() {
    const clientRoot = 'E:\\Demon\\assets\\Script\\Client\\Src\\';
    const clientPlayFolders = [
        'AdSkip',
        'Announcement',
        'Attain',
        'CDKey',
        'Chat',
        'Common',
        'CumulativeRecharge',
        'DailyAdv',
        'DailyTask',
        'Deposit',
        'DepositGiftPack',
        'FirstCharge',
        'FirstAdv',
        'Foundation',
        'Friend',
        'FuncUnlock',
        'GM',
        'IAP',
        'Instruction',
        'InviteNew',
        'Item',
        'ItemFly',
        'LastTouch',
        'Mail',
        'MonthCard',
        'Normal',
        'OpenStorage',
        'PlayerShare',
        'Promote',
        'RandReward',
        'RemoteTimer',
        'ServerUpdata',
        'Shield',
        'Shop',
        'Sign',
        'SimpleShop',
        'Stat',
        'Subscribe',
        'System',
        'Task',
        'Tips',
        'Tools',
        'Tribe',
        'UserInfo',
        'WeiBo',
    ];

    const serverRoot = 'E:\\Demon\\assets\\Script\\Server\\';
    const serverPlayFolders = [
        'AdSkip',
        'DailyAdv',
        'DailyTask',

        'Deposit',
        'FirstCharge',
        'Foundation',
        'GM',
        'PlayerShare',
        'Shop',
        'Sign',
        'Task',
        'GM',
        'GM',
    ];

    for (let play of serverPlayFolders) {
        console.log('move play folder:', play);
        crTSImportResolver.moveTSto(serverRoot, `kzGame\\Play\\${play}`, `kzServer\\Play\\${play}`);
    }
    console.log('move all folder complete');
}

test3();