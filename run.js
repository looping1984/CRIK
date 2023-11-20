const node = {
    js: {
        process: require('process'),
        jsdom: require('jsdom'),
        path: require("path"),
    },
};

//采用jsdom模拟部分dom
let jdom = new node.js.jsdom.JSDOM('', {
    url: 'http://localhost', //模拟本地页面，使得window.localStorage能用
});
global.window = global.window || jdom.window;
global.document = global.document || jdom.window.document;
global.WebSocket = global.WebSocket || jdom.window.WebSocket;

function __get_entry_js() {
    let entry_js = node.js.process.argv[2];
    entry_js && (entry_js = entry_js.trim());
    if (!entry_js) {
        entry_js = global['__entry_js__'];
        entry_js && (entry_js = entry_js.trim());
    }
    if (!entry_js) {
        return;
    }
    //js路径处理
    if (!entry_js.includes(':')) {
        //相对路径
        entry_js = node.js.path.join(node.js.process.cwd(), entry_js);
    }
    return entry_js;
}

let entry_js = __get_entry_js();
if (!entry_js) {
    console.warn('no entry js to run...');
    console.warn('please use command: "node run <your_tool_entry_js_path>"');
    console.warn('or set global.__entry_js__ as <your_tool_entry_js_path> before require run.js');
    return;
}
console.log(`enter ${entry_js}..`);
require(entry_js);