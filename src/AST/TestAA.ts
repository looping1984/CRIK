import { crASTHelper, crTSExportObject, crTSExportType } from "./predec";

export class TestAA extends crASTHelper {
    constructor() {
        super();
        console.log('val', crTSExportType.Class);
    }
    static _get(): crTSExportObject {
        return undefined;
    }
}

const c_c = 5;

function _get() {
    return 6;
}

export enum Enum {
    Type1 = crTSExportType.Enum,
    Type2 = 2,
    Type3 = c_c,
    Type4 = _get(),
}