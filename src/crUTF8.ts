
// http://www.onicos.com/staff/iz/amuse/javascript/expert/utf.txt

import { crStringBuilder } from "./crStringBuilder";

/**
*utf.js - UTF-8 <=> UTF-16 convertion
*
* Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>
* Version: 1.0
* LastModified: Dec 25 1999
* This library is free.  You can redistribute it and/or modify it.
*/
export class crUTF8 {
    static utf8ArrayToString(array: ArrayLike<number>, offset?: number, byteNum?: number): string {
        let out = crUTF8.g_sb;
        let c: number;
        let char2: number;
        let char3: number;
        let idx = offset || 0;
        let len = (byteNum || (array.length - idx)) + idx;
        while (idx < len) {
            c = array[idx++];
            switch (c >> 4) {
                case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
                    // 0xxxxxxx
                    out.append(String.fromCharCode(c));
                    break;
                case 12: case 13:
                    // 110x xxxx   10xx xxxx
                    char2 = array[idx++];
                    out.append(String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F)));
                    break;
                case 14:
                    // 1110 xxxx  10xx xxxx  10xx xxxx
                    char2 = array[idx++];
                    char3 = array[idx++];
                    out.append(String.fromCharCode(((c & 0x0F) << 12) | ((char2 & 0x3F) << 6) | ((char3 & 0x3F) << 0)));
                    break;
            }
        }
        return out.toStringThenClear();
    }

    static string2Utf8Array(s: string): Uint8Array {
        s = s.replace(/[\u0080-\u07ff]/g, function (c: string) {
            let code = c.charCodeAt(0);
            return String.fromCharCode(0xC0 | code >> 6, 0x80 | code & 0x3F);
        });
        s = s.replace(/[\u0080-\uffff]/g, function (c: string) {
            let code = c.charCodeAt(0);
            return String.fromCharCode(0xE0 | code >> 12, 0x80 | code >> 6 & 0x3F, 0x80 | code & 0x3F);
        });
        let n = s.length;
        let ary = new Uint8Array(n);
        for (let i = 0; i < n; ++i) {
            ary[i] = s.charCodeAt(i);
        }
        return ary;
    }

    static fastString2Array(s: string, tempArray?: Array<number>): Array<number> {
        let ba = tempArray || new Array<number>();
        if (!s) {
            ba.length = 0;
            return ba;
        }
        ba.length = s.length * 4;
        let slen = s.length;
        let count = 0;
        for (let j = 0; j < slen;) {
            let c = s.codePointAt(j);
            if (c < 128) {
                ba[count++] = c;
                j++;
            }
            else if ((c > 127) && (c < 2048)) {
                ba[count++] = (c >> 6) | 192;
                ba[count++] = (c & 63) | 128;
                j++;
            }
            else if ((c > 2047) && (c < 65536)) {
                ba[count++] = (c >> 12) | 224;
                ba[count++] = ((c >> 6) & 63) | 128;
                ba[count++] = (c & 63) | 128;
                j++;
            }
            else {
                ba[count++] = (c >> 18) | 240;
                ba[count++] = ((c >> 12) & 63) | 128;
                ba[count++] = ((c >> 6) & 63) | 128;
                ba[count++] = (c & 63) | 128;
                j += 2;
            }
        }
        ba.length = count;
        return ba;
    }

    private static _g_sb: crStringBuilder;
    private static get g_sb() {
        let sb = crUTF8._g_sb || (crUTF8._g_sb = new crStringBuilder());
        sb.clear();
        return sb;
    }
}