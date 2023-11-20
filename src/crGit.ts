
import * as jsprc from 'child_process';
import { crPath } from './crPath';

/**
 * 封装一些简单的git操作接口
 */
export class crGit {
    /**
     * 获取当前git分支名称
     * @param callback git执行后的回调，可选
     * @param depressLog 是否抑制普通日志，默认false
     * @returns 当前分支名称
     */
    static fetchGitBranch(callback?: (branch: string) => any, depressLog?: boolean) {
        let branch: string;
        let pp = crPath.currentDirectory;
        let cmd: string;
        if (pp) {
            //客户端
            cmd = `git -C "${pp}" branch`;
        } else {
            //服务端
            cmd = 'git branch';
        }
        if (!depressLog) {
            console.log('exe git sync:', cmd);
        }
        try {
            let result = jsprc.execSync(cmd).toString();
            branch = crGit._parseGitBranch(result);
            callback && callback(branch);
        } catch (e) {
            console.error('exe git error:', e);
            callback && callback(undefined);
        }
        return branch;
    };

    /**
     * 获取当前分支的最近一次提交
     * @param callback 
     */
    static fetchLatestCommit(callback: (commit: string) => any) {
        let cmd = `git -C "${crPath.currentDirectory}" log -1`;
        jsprc.exec(cmd, (err, stdout, stderr) => {
            if (err) {
                console.error(err);
                callback(undefined);
                return;
            }
            if (stderr) {
                console.error('stderr:\n', stderr);
                callback(undefined);
                return;
            }
            let flag = 'commit';
            let idx = stdout.indexOf(flag);
            if (idx === -1) {
                console.error('error: git log error');
                callback(undefined);
                return;
            }
            idx += flag.length;
            let commit = "";
            while (++idx < stdout.length) {
                let c = stdout.charAt(idx);
                if (c === '\r' || c === '\n' || c === ' ' || c === '    ' || c === '(') {
                    if (commit.length > 0) {
                        break;
                    };
                } else {
                    commit += c;
                }
            }
            if (commit.length === 0) {
                console.error('error: get latest commit failed');
                callback(undefined);
                return;
            }
            callback(commit);
        });
    }

    /**
     * 获取git配置的全局用户名
     * @param callback 
     */
    static getUserName(callback: (user: string) => any) {
        let cmd = `git -C "${crPath.currentDirectory}" config --global --get user.name`;
        jsprc.exec(cmd, (err, stdout, stderr) => {
            if (err) {
                console.error(err);
                callback(undefined);
                return;
            }
            if (stderr) {
                console.error('stderr:\n', stderr);
                callback(undefined);
                return;
            }
            let name = stdout.trim();
            if (name.length === 0) {
                console.error('error: must set git global config user.name');
                callback(undefined);
                return;
            }
            callback(name);
        });
    }

    private static _parseGitBranch(gitOut: string) {
        let idx = gitOut.indexOf('*');
        if (idx === -1) {
            console.error('error: git branch ret of no current branch');
            return undefined;
        }
        let branch = '';
        while (++idx < gitOut.length) {
            let c = gitOut.charAt(idx);
            if (c === '\r' || c === '\n') {
                break;
            }
            branch += c;
        }
        branch = branch.trim();
        if (!branch) {
            console.error('error: current branch empty');
            return undefined;
        }
        return branch;
    }
}