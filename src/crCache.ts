import { crFS } from "./crFS";
import { crMoreUtil } from "./crMoreUtil";
import { AppendSlashType, crPath } from "./crPath";
import { is_null } from "./crUtil";

/**
 * cache的文件
 */
export class crCacheFile {
    private _master: crCache;
    private _originalPath: string;
    private _originalMD5: string;
    private _cachePath: string;
    private _cacheEncoding: string;
    private _cacheContent: string | Buffer;
    private _cacheExtra: any;
    constructor(master: crCache, path: string, md5?: string, cacheEncoding?: BufferEncoding, cacheExtra?: any) {
        this._master = master;
        this._originalPath = path;
        this._originalMD5 = md5;
        this._cacheEncoding = cacheEncoding;
        this._cacheExtra = cacheExtra;
    }
    /**
     * 原始路径
     */
    get originalPath() {
        return this._originalPath;
    }
    get originalMD5() {
        return this._originalMD5;
    }
    get cachePath() {
        if (!this._cachePath) {
            this._cachePath = crPath.join(this._master.path, this._originalPath.replace(/[\\\/\.\:]/g, '_'));
        }
        return this._cachePath;
    }
    get cacheContent() {
        if (!this._cacheContent && this._originalMD5) {
            this._cacheContent = this._readCacheContent();
        }
        return this._cacheContent;
    }
    get cacheEncoding() {
        return this._cacheEncoding;
    }
    get cacheExtra() {
        return this._cacheExtra;
    }
    outOfDate(md5: string, extra?: any) {
        if (!md5) {
            md5 = this._readFileMD5(this.originalPath);
        }
        return md5 !== this._originalMD5 || extra !== this._cacheExtra;
    }
    updateFrom(filePath: string, cacheEncoding: BufferEncoding, originalMD5: string, extra?: any) {
        this.updateContent(cacheEncoding === 'binary' ? crFS.read_binary(filePath) : crFS.read_text(filePath, cacheEncoding), cacheEncoding, originalMD5, extra);
    }
    updateContent(cacheContent: string | Buffer, cacheEncoding?: BufferEncoding, originalMD5?: string, extra?: any) {
        is_null(extra) && (extra = undefined);
        if (cacheContent) {
            //刷新cache内容
            cacheEncoding || (cacheEncoding = 'utf-8');
            crFS.write_binary(this.cachePath, cacheContent, cacheEncoding);
            this._cacheContent = cacheContent;
            this._cacheEncoding = cacheEncoding;
        }
        if (!originalMD5) {
            originalMD5 = this._readFileMD5(this.originalPath);
        }
        if (originalMD5 != this._originalMD5 || extra !== this._cacheExtra) {
            this._originalMD5 = originalMD5;
            this._cacheExtra = extra;
            this._invalidate();
        }
    }
    delete() {
        if (this._originalMD5) {
            this._originalMD5 = undefined;
            this._cacheExtra = undefined;
            this._invalidate();
        }
    }
    private _readFileMD5(path: string) {
        return crMoreUtil.textFileMD5(path) || path;
    }
    private _readCacheContent() {
        return this._cacheEncoding === 'binary' ? crFS.read_binary(this.cachePath) : crFS.read_text(this.cachePath);
    }
    private _invalidate() {
        this._master.invalidateFile(this.originalPath);
    }
}

/**
 * 全局工具的cache
 */
export class crCache {
    /**
     * 全局cache的根路径
     */
    static cacheRoot = './.cr_local/.cache/';
    /**
     * 获取一个本地cache域
     * @param name cache域名称，传空表示使用共享域（谨慎）
     * @param version 版本，可选
     * @returns 域实例，保证不返回空
     */
    static domain(name?: string, version?: string) {
        crCache.s_domains || (crCache.s_domains = {});
        name = crPath.removeLastSlash(name || '__shared');
        let c = crCache.s_domains[name];
        if (!c) {
            c = new crCache(name, version, crCache.cacheRoot);
            crCache.s_domains[name] = c;
        }
        return c;
    }

    private static s_domains: Record<string, crCache>;

    private _parentRoot: string;
    private _name: string;
    private _version: string;
    private _path: string;
    private _caches: Record<string, crCacheFile>;
    private _autoSubmit: boolean;
    private _sumbitTimer: any;
    constructor(name: string, version: string, parentRoot: string, autoSubmit: boolean = true) {
        this._name = crPath.removeLastSlash(name || '__shared');
        this._version = version || '';
        this._parentRoot = parentRoot || '';
        this._path = this._buildCachePath(this._name, this._version, this._parentRoot);
        this._autoSubmit = autoSubmit;
    }
    private _buildCachePath(name: string, version: string, parentRoot: string) {
        return crPath.join(parentRoot, name + (version ? '_' + version : ''));
    }
    /**
     * 当前域的名称
     */
    get name() { return this._name; }
    /**
     * 当前域的版本，默认为空字符串。设置了不同版本，则当前域清空
     */
    get version() { return this._version; }
    set version(ver: string) {
        ver = ver || '';
        if (this._version !== ver) {
            this.clearCache();
            this._version = ver;
            this._path = this._buildCachePath(this._name, this._version, this._parentRoot);
        }
    }
    /**
     * 当前域的cache根路径
     */
    get path() { return this._path; }
    /**
     * 当前域的cache内容自动存储，默认true
     */
    get autoSubmit() {
        return this._autoSubmit;
    }
    set autoSubmit(val: boolean) {
        this._autoSubmit = val;
    }
    /**
     * 获取某个文件的cache，保证不为空
     * @param filePath 原始文件路径
     */
    cacheFile(filePath: string) {
        filePath = crPath.standardize(filePath, AppendSlashType.Never);
        let c = this.caches[filePath];
        if (!c) {
            c = new crCacheFile(this, filePath);
            this.caches[c.originalPath] = c;
        }
        return c;
    }
    /**
     * 尝试从cache中获取给定文件对应的cache
     * @param filePath 文件路径
     * @param md5 文件可能的新md5，可选。不填则从filePath中自动计算
     * @param extra 额外的比较参数。有时候文件本身没有变化，但是整个处理流程（比如代码）更改，需要引入额外的比较
     * @returns 如果该文件当前版本有对应的cache，则返回该cache 内容，否则返回undefined
     */
    tryGetCache(filePath: string, md5?: string, extra?: any) {
        let c = this.cacheFile(filePath);
        if (!c.outOfDate(md5, extra)) {
            return c.cacheContent;
        }
        return undefined;
    }
    /**
     * 刷新给定文件对应的cache
     * @param filePath 原始文件路径
     * @param cacheContent cache内容
     * @param cacheEncoding cache内容编码，可选，默认utf8
     * @param fileMD5 原始文件的版本，可选。不填则自动从filePath里读取内容并生成md5码作为版本
     * @param extra 额外的比较参数。有时候文件本身没有变化，但是整个处理流程（比如代码）更改，需要引入额外的比较
     */
    updateCache(filePath: string, cacheContent: string | Buffer, cacheEncoding?: BufferEncoding, fileMD5?: string, extra?: any) {
        let c = this.cacheFile(filePath);
        c.updateContent(cacheContent, cacheEncoding, fileMD5, extra);
    }
    /**
     * 清理当前域所有cache
     */
    clearCache(clearFolder: boolean = true) {
        clearFolder && crPath.clearFolder(this.path);
        this._caches = undefined;
    }
    /**
     * 将所有cache保存到本地
     */
    submit() {
        this._writeCache(this);
    }
    /**
     * 给定文件有更新
     * @param originalFilePath
     */
    invalidateFile(originalFilePath: string) {
        if (this._autoSubmit && !this._sumbitTimer) {
            this._sumbitTimer = setTimeout(this._writeCache, 200, this);
        }
    }
    get listFilePathOfCache() {
        return this.path + '__cache_list.json';
    }
    /**
     * 所有cache的文件信息
     */
    get caches() {
        if (!this._caches) {
            this._caches = {};
            let cs = crFS.read_json(this.listFilePathOfCache) || {};
            for (let path in cs) {
                let c = cs[path];
                this._caches[c.originalPath] = new crCacheFile(this, c.originalPath, c.originalMD5, c.cacheEncoding, c.cacheExtra);
            }
        }
        return this._caches;
    }
    private _writeCache(_this: crCache) {
        _this._sumbitTimer = undefined;
        if (!_this._caches) {
            return;
        }
        let json = {};
        for (let key in _this._caches) {
            let c = _this._caches[key];
            if (c.originalMD5) {
                json[c.originalPath] = {
                    originalPath: c.originalPath,
                    originalMD5: c.originalMD5,
                    cacheEncoding: c.cacheEncoding,
                    cacheExtra: c.cacheExtra,
                };
            }
        }
        crFS.write_json(_this.listFilePathOfCache, json, true);
    }
}